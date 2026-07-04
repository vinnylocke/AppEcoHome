import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

export const usePushNotifications = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // 1. ARM THE LISTENERS INSTANTLY (Zero wait time!)
    const initializeListeners = async () => {
      await PushNotifications.removeAllListeners();

      // Listener A: Save token to Supabase when it arrives
      await PushNotifications.addListener("registration", async (token) => {
        // We check the session right here, AFTER the token arrives
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;

        const platform = Capacitor.getPlatform();
        await supabase.from("user_devices").upsert(
          {
            user_id: session.user.id,
            token: token.value,
            platform: platform,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "user_id,token" },
        );
      });

      // Listener B: Log errors
      await PushNotifications.addListener("registrationError", (error) => {
        Logger.error("Error on push registration", error);
      });

      // Listener C: App is actively open on screen
      await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          toast.success(`🌿 ${notification.title}: ${notification.body}`, {
            duration: 4000,
          });
        },
      );

      // Listener D: notification tapped — mark it read silently. Failures are
      // logged (Sentry), never surfaced to the user.
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        async (action) => {
          const notificationId = action.notification.data?.notification_id;
          if (!notificationId) return;

          const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", notificationId);

          if (error) {
            Logger.error("Failed to mark notification read on tap", error, {
              notificationId,
            });
          }
        },
      );
    };

    // Fire immediately before React does anything else
    initializeListeners();

    // 2. NOW WE HANDLE AUTH & ASKING GOOGLE FOR TOKENS
    const requestPushToken = async () => {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive === "granted") {
        await PushNotifications.register(); // This triggers Listener A!
      }
    };

    // Watch for login
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          requestPushToken();
        }
      },
    );

    // Check if already logged in on boot
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        requestPushToken();
      }
    });

    // Cleanup
    return () => {
      authListener.subscription.unsubscribe();
      PushNotifications.removeAllListeners();
    };
  }, []);
};
