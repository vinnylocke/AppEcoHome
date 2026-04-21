import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { JWT } from "npm:google-auth-library@9.6.3";

serve(async (req) => {
  try {
    // 1. Parse the Webhook Payload from Supabase
    const payload = await req.json();
    const record = payload.record;

    // If this wasn't triggered by an INSERT with a valid record, ignore it
    if (!record || !record.user_id) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook payload" }),
        { status: 400 },
      );
    }

    const { user_id, title, body, data } = record;

    // 2. Initialize Supabase Admin Client
    // We use the SERVICE_ROLE key to bypass RLS so the server can read the user_devices table safely
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 3. Find all devices owned by this user
    const { data: devices, error: dbError } = await supabase
      .from("user_devices")
      .select("token")
      .eq("user_id", user_id);

    if (dbError || !devices || devices.length === 0) {
      console.log(`No devices found for user ${user_id}`);
      return new Response(
        JSON.stringify({ success: true, message: "No devices to notify" }),
        { status: 200 },
      );
    }

    // 4. Authenticate with Firebase securely
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountRaw)
      throw new Error("Missing Firebase Service Account Key");

    const serviceAccount = JSON.parse(serviceAccountRaw);

    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    // Get the temporary access token to talk to Google
    const tokens = await jwtClient.getAccessToken();

    // 5. Blast the notification to all of the user's devices
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const sendPromises = devices.map((device) => {
      return fetch(fcmUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: title,
              body: body,
            },
            data: data || {}, // Extra routing data
          },
        }),
      });
    });

    await Promise.all(sendPromises);

    console.log(`Successfully sent push to ${devices.length} devices.`);
    return new Response(
      JSON.stringify({ success: true, count: devices.length }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Push Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
