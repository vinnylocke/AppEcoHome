/**
 * Attach one or more files to a Jira issue.
 *
 *   node scripts/jira-attach.mjs <ISSUE-KEY> <file> [file...]
 *   node scripts/jira-attach.mjs RHO-2 docs/jira-evidence/RHO-2/shot.png
 *
 * Reads JIRA_EMAIL + JIRA_API_TOKEN from .env (the MCP can't upload files, so we
 * hit the REST API directly). Token: https://id.atlassian.com/manage-profile/security/api-tokens
 */
import { readFileSync } from "fs";
import { basename, resolve } from "path";

for (const f of [".env", ".env.local"]) {
  try {
    for (const l of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
      const m = l.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* optional */ }
}

const SITE = "https://rhozly.atlassian.net";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const [key, ...files] = process.argv.slice(2);

if (!EMAIL || !TOKEN) { console.error("✖ Missing JIRA_EMAIL / JIRA_API_TOKEN in .env"); process.exit(1); }
if (!key || files.length === 0) { console.error("Usage: node scripts/jira-attach.mjs <ISSUE-KEY> <file> [file...]"); process.exit(1); }

const auth = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

for (const file of files) {
  const fd = new FormData();
  fd.append("file", new Blob([readFileSync(file)]), basename(file));
  const res = await fetch(`${SITE}/rest/api/3/issue/${key}/attachments`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "X-Atlassian-Token": "no-check" },
    body: fd,
  });
  const out = await res.json().catch(() => ({}));
  if (res.ok && Array.isArray(out)) {
    console.log(`✓ ${key} ← ${out.map((a) => `${a.filename} (${a.size}b)`).join(", ")}`);
  } else {
    console.error(`✖ ${file} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
    process.exit(1);
  }
}
