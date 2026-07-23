/**
 * Rhozly — Beta Bug Report form + Jira bridge (Google Apps Script)
 * ---------------------------------------------------------------------------
 * Run setup() ONCE to generate the branded Google Form, link a responses
 * Sheet, and wire submissions to Jira. Each submission then creates a bug in
 * project RHO, formatted exactly like the hand-written tickets (Description /
 * Set Up / Steps / Expected / Actual). Priority and labels are left off.
 *
 * WHY A SHEET? The trigger runs off the form's linked spreadsheet, so the event
 * gives us the answers directly (e.namedValues). This avoids the standalone-
 * script "No response with ID … exists for this form" error you get from
 * e.response.getItemResponses(), and gives you a tidy sheet of every report
 * with its Jira key alongside.
 *
 * FIRST-TIME SETUP (full click-by-click walkthrough: docs/beta/bug-report-form.md)
 *  1. In this Apps Script project: Project Settings (gear) → Script properties →
 *     add these four. JIRA_EMAIL and JIRA_TOKEN are already in your repo .env
 *     (as JIRA_EMAIL and JIRA_API_TOKEN) — copy those values across:
 *        JIRA_BASE          https://rhozly.atlassian.net
 *        JIRA_EMAIL         <value of JIRA_EMAIL from .env>
 *        JIRA_TOKEN         <value of JIRA_API_TOKEN from .env>
 *        JIRA_PROJECT_KEY   RHO
 *  2. Run setup() once (Run ▸ setup). Approve the permission prompts.
 *  3. Check the execution log — it prints the form's share link, the edit link,
 *     and the responses-sheet link. Open the edit link to add the header image
 *     and green theme, then share the form link.
 *
 * AMENDMENTS: the form allows "Edit your response". An edit updates the SAME
 * row in the sheet and re-fires the trigger, so the script updates the SAME
 * Jira ticket (and adds a comment) instead of creating a duplicate — it stores
 * each ticket's key in a "Jira Key" column next to the response.
 */

// ── Question titles (shared by setup + submit handler — keep in sync) ────────
const T = {
  email:    "Email you use to log into Rhozly",
  area:     "Which part of the app?",
  summary:  "One-line summary",
  desc:     "What went wrong?",
  steps:    "Steps to reproduce",
  expected: "What did you expect to happen?",
  actual:   "What actually happened?",
  tier:     "Which plan are you on?",
  device:   "What device were you on?",
  orient:   "Screen orientation",
  install:  "How were you using Rhozly?",
  version:  "App version",
  shots:    "Link to a screenshot or screen recording (optional)",
  notes:    "Anything else? (optional)",
};

const JIRA_KEY_HEADER = "Jira Key";

const AREAS = [
  "Dashboard", "Garden Walk", "The Shed (plants)", "Schedule", "Planner",
  "Plant Lens (identify / diagnose)", "Garden Profile & Quiz", "Locations & Areas",
  "Watchlist", "Garden Layout", "Light Sensor", "Sun Tracker", "Companion Planting",
  "Plant Visualiser", "Guides", "Shopping List", "Weather", "Notifications",
  "Sign-up / Onboarding / Billing", "Other / not sure",
];
const TIERS   = ["Sprout (Free)", "Botanist", "Sage", "Evergreen", "Not sure"];
const ORIENTS = ["Portrait", "Landscape", "Desktop / N-A"];
const INSTALL = ["Installed app (PWA / added to home screen)", "Web browser", "Android APK", "iOS"];

// ── OPTIONAL: set your Jira credentials by RUNNING this once ──────────────────
// Faster than the Project Settings UI. Fill in the two <PASTE …> values from your
// repo .env (JIRA_EMAIL and JIRA_API_TOKEN), then Run ▸ saveConfig once. Script
// Properties persist for the life of the project, so you only do this per project.
// (You may blank the two values again afterwards if you like — they're saved.)
// ⚠ Don't commit real credentials back into the repo copy of this file.
function saveConfig() {
  PropertiesService.getScriptProperties().setProperties({
    JIRA_BASE: "https://rhozly.atlassian.net",
    JIRA_EMAIL: "<PASTE value of JIRA_EMAIL from .env>",
    JIRA_TOKEN: "<PASTE value of JIRA_API_TOKEN from .env>",
    JIRA_PROJECT_KEY: "RHO",
  });
  Logger.log("✅ Saved Jira config to Script Properties.");
}

// ── Run ONCE: build the form + linked sheet + install the submit trigger ─────
function setup() {
  const form = FormApp.create("Rhozly Beta — Report a Bug");
  form.setDescription(
    "Thanks for helping test Rhozly! 🌿 The more detail you give, the faster we can squash it. " +
    "Fields marked * are required — the rest just help."
  );
  form.setCollectEmail(false);           // we ask for the login email explicitly below
  form.setProgressBar(true);
  form.setAllowResponseEdits(true);      // testers can amend — see onRhozlyFormSubmit (updates the same ticket)
  form.setConfirmationMessage(
    "Thank you! 🌱 Your report has gone straight to our tracker — we'll take it from here.\n\n" +
    "Need to change or add something? Use the “Edit your response” link on this page — " +
    "it updates the same report rather than sending a new one."
  );

  form.addTextItem().setTitle(T.email).setRequired(true)
    .setHelpText("The address on your Rhozly account (no password needed).");

  form.addListItem().setTitle(T.area).setChoiceValues(AREAS).setRequired(true)
    .setHelpText("Where in the app did it happen?");

  form.addTextItem().setTitle(T.summary).setRequired(true)
    .setHelpText("One line, e.g. \"Overdue task shows as completed on time\".");

  form.addParagraphTextItem().setTitle(T.desc).setRequired(true)
    .setHelpText("Describe the problem in your own words.");

  form.addParagraphTextItem().setTitle(T.steps).setRequired(true)
    .setHelpText("One step per line — how would we make it happen again?\n1. …\n2. …\n3. …");

  form.addParagraphTextItem().setTitle(T.expected).setRequired(true);
  form.addParagraphTextItem().setTitle(T.actual).setRequired(true);

  form.addPageBreakItem().setTitle("Your set-up")
    .setHelpText("A few quick details about how you were using Rhozly.");

  form.addMultipleChoiceItem().setTitle(T.tier).setChoiceValues(TIERS).setRequired(true);
  form.addTextItem().setTitle(T.device).setRequired(true)
    .setHelpText("e.g. Google Pixel Tablet, iPhone 14, Windows laptop.");
  form.addMultipleChoiceItem().setTitle(T.orient).setChoiceValues(ORIENTS).setRequired(true);
  form.addMultipleChoiceItem().setTitle(T.install).setChoiceValues(INSTALL).setRequired(true);
  form.addTextItem().setTitle(T.version)
    .setHelpText("Find it in Profile → shown as \"Rhozly OS 35.xxxx\". Skip if you can't find it.");

  form.addTextItem().setTitle(T.shots)
    .setHelpText("Optional — paste a Drive/Photos/Imgur link. (To let testers upload files directly, " +
                 "add a File-upload question here manually — Apps Script can't create one.)");
  form.addParagraphTextItem().setTitle(T.notes);

  // Link a responses spreadsheet and drive the trigger off IT (reliable
  // e.namedValues; no fragile FormResponse lookup).
  const ss = SpreadsheetApp.create("Rhozly Beta — Bug Reports (responses)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === "onRhozlyFormSubmit") ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger("onRhozlyFormSubmit").forSpreadsheet(ss).onFormSubmit().create();

  Logger.log("✅ Form created.");
  Logger.log("   Share this link with testers:  " + form.getPublishedUrl());
  Logger.log("   Edit / brand the form here:     " + form.getEditUrl());
  Logger.log("   Responses + Jira keys (Sheet):  " + ss.getUrl());
}

// ── On every submission (or edit): create or update the Jira bug ─────────────
function onRhozlyFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (_) { /* proceed uncontended */ }
  try {
    const nv = e.namedValues || {};
    const get = function (title) { return ((nv[title] || [""])[0] || "").toString().trim(); };

    const area = get(T.area);
    const title = get(T.summary) || "Beta bug report";
    const summary = (area && area.indexOf("Other") !== 0 && area.indexOf("/ not sure") === -1)
      ? area.replace(/\s*\(.*?\)\s*/g, "") + " - " + title
      : title;

    const setupSentence =
      "This was on " + (get(T.device) || "an unknown device") +
      (get(T.orient) ? " in " + get(T.orient) + " orientation" : "") +
      " using the " + (get(T.install) || "app") +
      ", on the " + (get(T.tier) || "unknown") + " tier.";

    const doc = adfDoc([
      boldPara("Description"),
      ...bodyParas(get(T.desc)),
      boldPara("Set Up"),
      para(setupSentence),
      labelLine("Email", get(T.email) || "—"),
      labelLine("App Version", get(T.version) || "—"),
      labelLine("APK or PWA or Browser", get(T.install) || "—"),
      boldPara("Steps"),
      orderedList(get(T.steps)),
      boldPara("Expected Results"),
      ...bodyParas(get(T.expected)),
      boldPara("Actual Results"),
      ...bodyParas(get(T.actual)),
    ]);

    if (get(T.shots)) { doc.content.push(boldPara("Screenshot / recording"), linkPara(get(T.shots))); }
    if (get(T.notes)) { doc.content.push(boldPara("Notes"), ...bodyParas(get(T.notes))); }

    // Dedup for amendments: the Jira key is stored in a column on this row.
    // An edited response updates the same row, so we find the key and UPDATE.
    const sheet = e.range.getSheet();
    const row = e.range.getRow();
    const keyCol = ensureJiraKeyColumn(sheet);
    const existingKey = String(sheet.getRange(row, keyCol).getValue() || "").trim();

    if (existingKey) {
      updateJiraBug(existingKey, summary, doc);
      addJiraComment(existingKey, "🔄 The reporter amended this report via the beta form.");
      Logger.log("Updated " + existingKey + " (amended response)");
    } else {
      const key = createJiraBug(summary, doc);
      sheet.getRange(row, keyCol).setValue(key);
      Logger.log("Created " + key);
    }
  } catch (err) {
    // Never lose a report — email the form owner the raw submission on failure.
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      "⚠️ Rhozly beta form → Jira failed",
      "Error: " + err + "\n\nRaw answers:\n" + JSON.stringify((e && e.namedValues) || {}, null, 2)
    );
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Find the "Jira Key" column on the responses sheet, creating it if absent.
function ensureJiraKeyColumn(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.indexOf(JIRA_KEY_HEADER);
  if (idx !== -1) return idx + 1;
  sheet.getRange(1, lastCol + 1).setValue(JIRA_KEY_HEADER);
  return lastCol + 1;
}

// ── Jira REST helpers ────────────────────────────────────────────────────────
function jiraCfg() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    base: (p.getProperty("JIRA_BASE") || "").replace(/\/$/, ""),
    email: p.getProperty("JIRA_EMAIL"),
    token: p.getProperty("JIRA_TOKEN"),
    project: p.getProperty("JIRA_PROJECT_KEY") || "RHO",
  };
  if (!cfg.base || !cfg.email || !cfg.token) throw new Error("Missing JIRA_* script properties (see setup notes).");
  return cfg;
}

function jiraFetch(path, method, body) {
  const cfg = jiraCfg();
  const res = UrlFetchApp.fetch(cfg.base + path, {
    method: method,
    contentType: "application/json",
    headers: { Authorization: "Basic " + Utilities.base64Encode(cfg.email + ":" + cfg.token) },
    payload: body ? JSON.stringify(body) : null,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code >= 300) throw new Error("Jira " + code + " on " + method + " " + path + ": " + res.getContentText());
  return res.getContentText();
}

// Returns the new issue key (e.g. "RHO-42").
function createJiraBug(summary, adf) {
  const cfg = jiraCfg();
  const out = jiraFetch("/rest/api/3/issue", "post", {
    fields: {
      project: { key: cfg.project },
      issuetype: { name: "Bug" },
      summary: summary.slice(0, 250),
      description: adf,
    },
  });
  return JSON.parse(out).key;
}

// Overwrite summary + description on an existing ticket (used for amendments).
function updateJiraBug(key, summary, adf) {
  jiraFetch("/rest/api/3/issue/" + encodeURIComponent(key), "put", {
    fields: { summary: summary.slice(0, 250), description: adf },
  });
}

function addJiraComment(key, text) {
  jiraFetch("/rest/api/3/issue/" + encodeURIComponent(key) + "/comment", "post", {
    body: adfDoc([para(text)]),
  });
}

// ── Tiny ADF (Atlassian Document Format) builders ────────────────────────────
function adfDoc(content) { return { type: "doc", version: 1, content: content }; }
function text(t, marks) { const n = { type: "text", text: t || " " }; if (marks) n.marks = marks; return n; }
function para(t) { return { type: "paragraph", content: [text(t)] }; }
function boldPara(t) { return { type: "paragraph", content: [text(t, [{ type: "strong" }])] }; }
function linkPara(url) { return { type: "paragraph", content: [text(url, [{ type: "link", attrs: { href: url } }])] }; }
function labelLine(label, value) {
  return { type: "paragraph", content: [text(label + ": ", [{ type: "strong" }]), text(value)] };
}
function bodyParas(t) {
  const lines = String(t || "—").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  return (lines.length ? lines : ["—"]).map(para);
}
function orderedList(t) {
  const items = String(t || "").split(/\r?\n/)
    .map(function (s) { return s.replace(/^\s*\d+[.)]\s*/, "").trim(); })
    .filter(Boolean);
  if (!items.length) return para("—");
  return {
    type: "orderedList",
    content: items.map(function (li) { return { type: "listItem", content: [para(li)] }; }),
  };
}
