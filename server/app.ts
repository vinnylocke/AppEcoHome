import express from "express";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { searchPlantbookServer } from "./plantbook.ts";
import { supabaseAdmin } from "./supabase.ts";

const app = express();
app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: process.env.NODE_ENV, provider: "Supabase" });
});

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
  });
});

app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VITE_VAPID_PUBLIC_KEY || "BDe_v_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p_p" });
});

app.get("/api/plantbook/search", async (req, res) => {
  const query = req.query.q as string;
  if (!query) return res.status(400).json({ error: "Missing query" });
  try {
    const results = await searchPlantbookServer(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Failed to search Plantbook" });
  }
});

app.post("/api/notifications/subscribe", async (req, res) => {
  const { fcmToken, userId } = req.body;
  if (!userId || !fcmToken) return res.status(400).json({ error: "Missing userId or fcmToken" });

  try {
    if (!supabaseAdmin) {
      console.warn('Supabase Admin not configured, skipping FCM token update');
      return res.json({ status: "ok", message: "Supabase not configured" });
    }
    // Update user profile with FCM token in Supabase
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ fcm_token: fcmToken })
      .eq('uid', userId);

    if (error) throw error;
    
    res.status(201).json({ message: "Subscribed successfully" });
  } catch (error) {
    console.error("Subscribe error:", error);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

app.post("/api/reports", async (req, res) => {
  const { guideId, guideTitle, description, userEmail } = req.body;
  if (!guideId || !description) return res.status(400).json({ error: "Missing guideId or description" });

  try {
    const { error } = await supabaseAdmin
      .from('reports')
      .insert({
        guide_id: guideId,
        guide_title: guideTitle,
        description,
        user_email: userEmail || 'Anonymous',
        status: 'new'
      });

    if (error) throw error;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: `"EcoHome App" <${process.env.SMTP_USER}>`,
        to: process.env.REPORT_EMAIL_TO || 'vinnylocke@gmail.com',
        subject: `Guide Problem Report: ${guideTitle || guideId}`,
        text: `Description: ${description}`,
      });
    }
    res.status(201).json({ message: "Report submitted successfully" });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

// Vercel Cron Endpoint
app.get("/api/cron/daily-notifications", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: users, error } = await supabaseAdmin
      .from('user_profiles')
      .select('uid, fcm_token')
      .not('fcm_token', 'is', null);

    if (error) throw error;

    let sentCount = 0;
    for (const user of users || []) {
      if (user.fcm_token) {
        await sendDailyNotification(user.uid);
        sentCount++;
      }
    }
    res.json({ message: `Processed ${sentCount} notifications` });
  } catch (error) {
    console.error("Cron error:", error);
    res.status(500).json({ error: "Cron failed" });
  }
});

async function sendDailyNotification(userId: string) {
  try {
    if (!supabaseAdmin) {
      console.error('Supabase Admin not configured, cannot send daily notifications');
      return;
    }
    const { data: user, error: userError } = await supabaseAdmin
      .from('user_profiles')
      .select('fcm_token, home_id')
      .eq('uid', userId)
      .single();

    if (userError || !user?.fcm_token || !user?.home_id) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('home_id', user.home_id)
      .eq('status', 'Pending')
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString());

    if (tasksError) return;

    if (tasks && tasks.length > 0) {
      console.log(`Tasks found for user ${userId}: ${tasks.length}`);
    }
  } catch (error) {
    console.error(`Notification error for user ${userId}:`, error);
  }
}

export { app };
