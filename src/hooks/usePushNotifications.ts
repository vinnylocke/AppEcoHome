import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

export const usePushNotifications = () => {
  useEffect(() => {
    // 1. Only run native Push logic on iOS and Android
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const registerDevice = async (userId: string) => {
      try {
        await PushNotifications.removeAllListeners();

        // 2. Listen for the successful generation of the Push Token
        await PushNotifications.addListener("registration", async (token) => {
          Logger.log(`Push token received: ${token.value.substring(0, 20)}...`);
          const platform = Capacitor.getPlatform();

          const { error } = await supabase.from("user_devices").upsert(
            {
              user_id: userId,
              token: token.value,
              platform: platform,
              last_used_at: new Date().toISOString(),
            },
            { onConflict: "user_id,token" },
          );

          if (error) {
            Logger.error("Failed to save push token to database", error);
          }
        });

        await PushNotifications.addListener("registrationError", (error) => {
          Logger.error("Error on push registration", error);
        });

        // 3. Handle a notification arriving while the app is actively open
        await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            toast.success(`🌿 ${notification.title}: ${notification.body}`, {
              duration: 4000,
              position: "top-center",
            });
          },
        );

        // ✨ 4. THE NEW UPGRADE: Handle tapping and marking as read
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          async (notification) => {
            const data = notification.notification.data;
            Logger.log("User tapped notification", data);

            // A. Mark as read in Supabase
            if (data && data.notification_id) {
              const { error } = await supabase
                .from("notifications")
                .update({ is_read: true })
                .eq("id", data.notification_id);

              if (error) {
                Logger.error("Failed to mark notification as read", error);
              } else {
                Logger.log(
                  `Notification ${data.notification_id} marked as read!`,
                );
              }
            }

            // B. Deep Linking (Example for later)
            // if (data && data.route) {
            //   window.location.href = data.route;
            // }
          },
        );

        // 5. Ask for permissions
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === "prompt") {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive === "granted") {
          await PushNotifications.register();
        } else {
          Logger.warn("User denied push notification permissions");
        }
      } catch (error) {
        Logger.error("Failed to initialize push notifications", error);
      }
    };

    // 6. Watch Supabase for login events to trigger registration
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          registerDevice(session.user.id);
        }
      },
    );

    // 7. Safety net if the user is already logged in on boot
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        registerDevice(session.user.id);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
      PushNotifications.removeAllListeners();
    };
  }, []);
};
