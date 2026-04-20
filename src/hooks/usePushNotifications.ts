import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

export const usePushNotifications = () => {
  useEffect(() => {
    // 1. We only want to run this native Push logic on iOS and Android
    // (Web PWA push notifications require a different Service Worker approach)
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const setupPushNotifications = async () => {
      try {
        // 2. Ask the OS for permission to send notifications
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === "prompt") {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== "granted") {
          Logger.warn("User denied push notification permissions");
          return;
        }

        // 3. Register the device with Apple (APNs) or Google (FCM)
        await PushNotifications.register();
      } catch (error) {
        Logger.error("Failed to initialize push notifications", error);
      }
    };

    const addListeners = async () => {
      // 4. Listen for the successful generation of the Push Token
      await PushNotifications.addListener("registration", async (token) => {
        Logger.log(`Push token received: ${token.value.substring(0, 20)}...`);

        // 5. Get the currently logged-in user
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;

        // 6. Save the token to our new Supabase table!
        const platform = Capacitor.getPlatform(); // returns 'ios' or 'android'

        const { error } = await supabase.from("user_devices").upsert(
          {
            user_id: session.user.id,
            token: token.value,
            platform: platform,
            last_used_at: new Date().toISOString(),
          },
          // This ensures we don't save duplicates
          { onConflict: "user_id,token" },
        );

        if (error) {
          Logger.error("Failed to save push token to database", error);
        }
      });

      // 7. Handle errors
      await PushNotifications.addListener("registrationError", (error) => {
        Logger.error("Error on push registration", error);
      });

      // 8. Handle a notification arriving while the app is actively open on the screen
      await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          // We show a toast since the OS usually hides banners if the app is open
          toast.success(`🌿 ${notification.title}: ${notification.body}`, {
            duration: 4000,
            position: "top-center",
          });
        },
      );

      // 9. Handle the user tapping a notification from their lock screen
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (notification) => {
          const data = notification.notification.data;
          Logger.log("User tapped notification", data);

          // Example: If the notification has a plant ID, we could navigate them there!
          // if (data.plantId) router.push(`/plant/${data.plantId}`);
        },
      );
    };

    setupPushNotifications();
    addListeners();

    // Cleanup listeners when the app unmounts
    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
};
