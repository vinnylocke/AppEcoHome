# Rhozly Beta — Bug Report Form

A Google Form for beta testers that mirrors the way we write bugs in Jira
(Description / Set Up / Steps / Expected / Actual). Two ways to run it — pick one.

Assets in this folder:
- `rhozly-beta-bug-form-header.png` — branded header image to upload into the form.
- `rhozly-bug-form.gs` — Google Apps Script that builds the form **and** files each
  submission as a Jira bug automatically.

---

## Path A — Auto-file into Jira (recommended)

A tester submits → a `RHO` bug appears in your backlog, formatted like your own
tickets. No copy-paste. The script **builds the whole form for you**, so you don't
assemble any questions by hand.

### Step-by-step

**1. Create the Apps Script project**
   - Go to <https://script.google.com> and click **New project** (top-left).
   - It opens an editor with a `Code.gs` file containing a stub `myFunction()`.
   - Select **all** the stub code and delete it.
   - Open `docs/beta/rhozly-bug-form.gs` from this repo, copy its entire contents,
     and paste them into the empty `Code.gs`.
   - Click the **💾 Save** icon. Give the project a name when prompted, e.g.
     *"Rhozly Beta Bug Form"*.

**2. Add your Jira credentials as Script Properties**
   - In the left sidebar click **Project Settings** (the ⚙ gear icon).
   - Scroll to **Script properties** → **Add script property** (do this 4×):

     | Property name | Value |
     |---------------|-------|
     | `JIRA_BASE` | `https://rhozly.atlassian.net` |
     | `JIRA_EMAIL` | the value of **`JIRA_EMAIL`** in your repo `.env` |
     | `JIRA_TOKEN` | the value of **`JIRA_API_TOKEN`** in your repo `.env` |
     | `JIRA_PROJECT_KEY` | `RHO` |

   - Click **Save script properties**.
   - (These live only in this private project — testers never see them, and nothing
     is committed to git. If you ever rotate the token in `.env`, update it here too.)

**3. Generate the form**
   - Back in the editor (**< >** Editor icon), open the function dropdown in the
     toolbar (it says `setup` if nothing else is selected) and make sure **`setup`**
     is chosen.
   - Click **▶ Run**.
   - A Google permission dialog appears the first time → **Review permissions** →
     choose your Google account → you'll see *"Google hasn't verified this app"*
     (expected, it's your own script) → **Advanced** → **Go to Rhozly Beta Bug Form
     (unsafe)** → **Allow**. (It needs to create a Form + responses Sheet, add a
     trigger, and call Jira, so it asks for Forms, Sheets, external-request and
     trigger permissions.)

**4. Grab your links**
   - After the run finishes, open the **Execution log** (bottom panel, or
     **View ▸ Logs**). It prints three URLs:
     - **Share link** — the public form; give this to beta testers.
     - **Edit link** — opens the form in edit mode so you can brand it (next section).
     - **Responses Sheet** — every submission lands here, with a **Jira Key** column
       showing the ticket each one created.

That's it. From now on every submission creates a `RHO` bug automatically. Tickets are
created under **your** account (the tester's email is captured in the **Set Up** block,
matching your ticket style). Priority and labels are left off.

> **Re-running `setup()`** (e.g. you ran it once already while testing): each run makes
> a **fresh** form + Sheet and re-points the trigger to the new one. Just use the new
> links from the latest run and delete the earlier test form/Sheet from your Drive so
> you don't share the wrong link.

> **Why a Sheet?** Driving the trigger off the form's linked spreadsheet is what makes
> it reliable — the submission handler reads answers straight from the row
> (`e.namedValues`). The earlier "No response with ID … exists for this form" error came
> from a standalone form trigger trying to look the response up; this approach sidesteps
> it entirely.

> **File uploads:** Apps Script can't create a file-upload question, so the script
> adds a *"link to a screenshot"* field instead. If you'd rather testers attach files
> directly, open the form editor and add one **File upload** question by hand (2 clicks).

### If testers want to amend their report

The form has **"Edit your response"** turned on. When a tester edits a submission:

- Google **updates the same row** in the responses Sheet and re-runs the script.
- The script reads the `RHO` key stored in that row's **Jira Key** column and
  **updates the existing ticket** — overwriting the summary + description with the new
  answers — instead of creating a duplicate.
- It also adds a Jira comment: *"🔄 The reporter amended this report via the beta form."*
  so you can see at a glance that it changed.

Two practical notes on the Google side:
- The **"Edit your response"** link appears on the confirmation page right after
  submitting. Testers who are **signed into a Google account** can also find it later
  under their Google Forms history; if they're not signed in, they need to keep that
  link (or just submit a fresh report).
- If a tester submits a brand-new response instead of editing, that's a new ticket —
  which is usually what you want anyway.

---

## Path B — No code (plain Google Form → email + Sheet)

If you'd rather not touch scripts, build the form by hand and let Google email you
each response (Form editor → **Responses** tab → ⋮ → *Get email notifications* and/or
*Link to Sheets*). You then paste answers into a new Jira bug.

Build these questions in order (★ = required):

| # | Question | Type | Req | Help text |
|---|----------|------|-----|-----------|
| 1 | Email you use to log into Rhozly | Short answer | ★ | The address on your account (no password needed). |
| 2 | Which part of the app? | Dropdown | ★ | Dashboard, Garden Walk, The Shed, Schedule, Planner, Plant Lens, Garden Profile, Locations & Areas, Watchlist, Garden Layout, Light Sensor, Sun Tracker, Companion Planting, Plant Visualiser, Guides, Shopping List, Weather, Notifications, Sign-up/Onboarding/Billing, Other |
| 3 | One-line summary | Short answer | ★ | e.g. "Overdue task shows as completed on time". |
| 4 | What went wrong? | Paragraph | ★ | Describe the problem in your own words. |
| 5 | Steps to reproduce | Paragraph | ★ | One step per line: 1. … 2. … 3. … |
| 6 | What did you expect to happen? | Paragraph | ★ | |
| 7 | What actually happened? | Paragraph | ★ | |
| — | *Section: Your set-up* | Section break | | |
| 8 | Which plan are you on? | Multiple choice | ★ | Sprout (Free) / Botanist / Sage / Evergreen / Not sure |
| 9 | What device were you on? | Short answer | ★ | e.g. Google Pixel Tablet, iPhone 14, Windows laptop |
| 10 | Screen orientation | Multiple choice | ★ | Portrait / Landscape / Desktop–N/A |
| 11 | How were you using Rhozly? | Multiple choice | ★ | Installed app (PWA) / Web browser / Android APK / iOS |
| 12 | App version | Short answer | | Profile → "Rhozly OS 35.xxxx". |
| 13 | Link to a screenshot / recording | Short answer | | Optional — or add a File-upload question here. |
| 14 | Anything else? | Paragraph | | |

Composed Jira summary = **{area} - {one-line summary}** (matching e.g.
"Garden Walkthrough - Completing an Overdue Task completes it on wrong day").

---

## Brand the form (either path)

In the form editor, click the **palette 🎨** (top right):

- **Header** → upload `rhozly-beta-bug-form-header.png`.
- **Colour** → pick the green closest to **#075737** (Rhozly Green). Forms samples
  the header, so it'll land near this automatically.
- **Background** → the light neutral (matches our `#faf9f7` canvas).
- **Font** → *Playful* or *Formal* both read fine; our display face is Plus Jakarta
  Sans, which Forms doesn't offer — the default is a clean stand-in.

---

## What a submission becomes in Jira

```
Summary:  Garden Walk - Overdue task shows as completed on time
Type:     Bug        Project: RHO

**Description**
<what went wrong>

**Set Up**
This was on a Google Pixel Tablet in Landscape orientation using the
Installed app (PWA), on the Sprout (Free) tier.
Email: tester@example.com
App Version: 35.0007
APK or PWA or Browser: Installed app (PWA)

**Steps**
1. …
2. …

**Expected Results**
<expected>

**Actual Results**
<actual>
```
