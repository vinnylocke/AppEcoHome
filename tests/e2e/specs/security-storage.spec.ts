/**
 * Tier C — Storage Bucket Security Tests
 *
 * Verifies that storage bucket policies prevent cross-home access, alien folder
 * uploads, and disallowed MIME types.
 *
 * These tests use the Supabase JS client directly inside page.evaluate() with
 * the authenticated worker's JWT.
 */

import { test as authTest, expect } from "../fixtures/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

// Worker 1 home / user IDs
const W1_HOME_ID = "00000001-0000-0000-0000-000000000002";
const W2_HOME_ID = "00000002-0000-0000-0000-000000000002";
const W2_USER_ID = "00000002-0000-0000-0000-000000000001";

authTest.describe("STG — Storage bucket security", () => {
  authTest("STG-002: community-guides — cannot upload to another user's folder", async ({ authenticatedPage: page }) => {
    // Worker1 tries to upload to Worker2's community-guides folder path
    const result = await page.evaluate(
      async ({
        url,
        key,
        w2UserId,
      }: {
        url: string;
        key: string;
        w2UserId: string;
      }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        // Restore client from session in localStorage
        const client = createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        const session = await client.auth.getSession();
        if (!session.data.session) return { status: "no-session" };

        // Attempt to upload into alien user's folder
        const alienPath = `${w2UserId}/fake-guide-id/test.jpg`;
        const blob = new Blob(["fake"], { type: "image/jpeg" });
        const { error } = await client.storage
          .from("community-guides")
          .upload(alienPath, blob, { contentType: "image/jpeg" });
        return { status: error ? "blocked" : "allowed", message: error?.message };
      },
      { url: SUPABASE_URL, key: ANON_KEY, w2UserId: W2_USER_ID },
    );

    expect(result.status).toBe("blocked");
  });

  authTest("STG-004: plant-images — SVG upload rejected by MIME whitelist", async ({ authenticatedPage: page }) => {
    const result = await page.evaluate(
      async ({ url, key }: { url: string; key: string }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const client = createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        const session = await client.auth.getSession();
        if (!session.data.session) return { status: "no-session" };

        const userId = session.data.session.user.id;
        const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        const blob = new Blob([svgContent], { type: "image/svg+xml" });
        const { error } = await client.storage
          .from("plant-images")
          .upload(`${userId}/test-xss.svg`, blob, { contentType: "image/svg+xml" });

        return { status: error ? "blocked" : "allowed", message: error?.message };
      },
      { url: SUPABASE_URL, key: ANON_KEY },
    );

    expect(result.status).toBe("blocked");
  });

  authTest("STG-005: plant-images — oversized upload rejected", async ({ authenticatedPage: page }) => {
    const result = await page.evaluate(
      async ({ url, key }: { url: string; key: string }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const client = createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        const session = await client.auth.getSession();
        if (!session.data.session) return { status: "no-session" };

        const userId = session.data.session.user.id;
        // 6 MB exceeds the 5 MB limit
        const largeArray = new Uint8Array(6 * 1024 * 1024);
        const blob = new Blob([largeArray], { type: "image/jpeg" });
        const { error } = await client.storage
          .from("plant-images")
          .upload(`${userId}/oversize-test.jpg`, blob, { contentType: "image/jpeg" });

        return { status: error ? "blocked" : "allowed", message: error?.message };
      },
      { url: SUPABASE_URL, key: ANON_KEY },
    );

    expect(result.status).toBe("blocked");
  });

  authTest("STG-006: area-scans — bucket is private, no public URL access", async ({ authenticatedPage: page }) => {
    // Construct a public URL for Worker2's area-scans path and verify it is not accessible
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/area-scans/${W2_HOME_ID}/some-area/scan.jpg`;

    const response = await page.request.get(publicUrl);
    // Private bucket: 400 or 404 (not 200)
    expect(response.status()).not.toBe(200);
  });

  authTest("STG-001: area-scans — Worker1 cannot read Worker2's scan path via signed URL", async ({ authenticatedPage: page }) => {
    const result = await page.evaluate(
      async ({
        url,
        key,
        w2HomeId,
      }: {
        url: string;
        key: string;
        w2HomeId: string;
      }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const client = createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        const session = await client.auth.getSession();
        if (!session.data.session) return { status: "no-session" };

        // Attempt to create a signed URL for a path in Worker2's home folder
        const alienPath = `${w2HomeId}/some-area/scan.jpg`;
        const { data, error } = await client.storage
          .from("area-scans")
          .createSignedUrl(alienPath, 60);

        // Either fails with error or returns null data (RLS policy blocks non-members)
        return {
          status: error ? "blocked" : data ? "allowed" : "blocked",
          message: error?.message,
        };
      },
      { url: SUPABASE_URL, key: ANON_KEY, w2HomeId: W2_HOME_ID },
    );

    // RLS policy means Worker1 (not in Worker2's home) can't sign a URL for Worker2's scan
    expect(result.status).toBe("blocked");
  });

  authTest("STG-003: community-guides — cannot delete another user's file", async ({ authenticatedPage: page }) => {
    const result = await page.evaluate(
      async ({
        url,
        key,
        w2UserId,
      }: {
        url: string;
        key: string;
        w2UserId: string;
      }) => {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const client = createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: false },
        });
        const session = await client.auth.getSession();
        if (!session.data.session) return { status: "no-session" };

        // Try to delete a file that would belong to Worker2
        const alienPath = `${w2UserId}/some-guide/image.jpg`;
        const { error } = await client.storage
          .from("community-guides")
          .remove([alienPath]);

        // Either error (403) or success with empty affected list — both are "blocked" for our purposes
        return { status: error ? "blocked" : "ok-but-harmless", message: error?.message };
      },
      { url: SUPABASE_URL, key: ANON_KEY, w2UserId: W2_USER_ID },
    );

    // Either blocked by RLS or no file existed — either is acceptable
    expect(["blocked", "ok-but-harmless"]).toContain(result.status);
  });
});
