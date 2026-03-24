import "dotenv/config"; // This loads your .env file into process.env immediately
import express from "express";
// ... rest of your imports
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { app } from "./server/app.ts";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Schedule daily notifications (Local/AI Studio only - Vercel uses vercel.json)
  const NOTIFICATION_TIME = "0 8 * * *";
  cron.schedule(NOTIFICATION_TIME, async () => {
    console.log("Running daily notification check...");
    try {
      // Trigger the internal cron logic via local request
      await fetch(`http://localhost:${PORT}/api/cron/daily-notifications`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
    } catch (error) {
      console.warn("Cron job failed:", error);
    }
  });
}

startServer();
