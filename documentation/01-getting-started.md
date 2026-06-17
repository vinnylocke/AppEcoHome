# Getting Started with Rhozly

Rhozly is a garden management app that helps you track plants, schedule care tasks, diagnose problems with AI, and get weather-aware gardening insights — all in one place.

---

## Creating an Account

When you open Rhozly for the first time you will land on the **Sign In** screen.

![The Rhozly sign-in screen with email and password fields and the Rhozly logo](/doc-images/01-getting-started-01-sign-in.webp)

1. Enter your **email address** and **password**.
2. Tap **Sign In**.
3. If you don't have an account yet, tap **Create Account** and follow the registration flow.
4. After a successful sign-in you are taken directly to the Dashboard.

---

## Setting Up Your First Home

Rhozly organises everything around a **Home** — a property or garden space. Every plant, task, location, and plan belongs to a home.

![The Add a Home screen — create a new home or join an existing one](/doc-images/01-getting-started-02-home-setup.webp)

On first login, if you have no home yet, Rhozly shows the **Home Setup** screen. Give your home a name (e.g. "My Garden", "Allotment", "Back Yard") and tap **Create Home**.

You can add more homes later — see [Switching and Adding Homes](./15-navigation-quick-add.md#home-switcher).

---

## The Habit Quiz (Optional but Recommended)

After your home is created, the Dashboard will show a **"Set up your Home Profile"** card. Completing the Habit Quiz unlocks AI plant recommendations and personalised task ordering.

![The Garden Profile page, where the Habit Quiz personalises your plant recommendations](/doc-images/01-getting-started-03-quiz.webp)

- Tap **Get started** on the card (or go to **Profile** → **Habit Quiz**).
- Answer a short set of questions about your experience level, available time, and growing preferences.
- Your answers are saved and used to personalise the app throughout.
- You can dismiss the card with the **✕** button if you prefer to skip for now.

See the full [Profile & Preferences guide](./14-profile-preferences.md) for details.

---

## Your First Day — Paced Walkthroughs

Rhozly never bombards you with tutorials. The pacing engine spaces out auto-walkthroughs so you see **at most one per day**, and feature-specific tours only fire after you've actually opened the feature. The exceptions are the **Welcome tour** and the **Home setup tour** — both essentials, so they run together on day one.

A typical first-day looks like:

1. **Sign in → Welcome tour** runs automatically.
2. **Set up your first home → Home setup tour** runs straight after.
3. **Open the Dashboard** → no new tour fires today; the daily throttle is satisfied.
4. **Tomorrow** → next time you open a fresh feature (Notes, Weekly Overview, Garden Walk, Nursery, Plant Doctor chat), that surface's mini-tour appears.

You can replay any tour any time from the **Help Center** (the **?** button) → **Walkthroughs** tab.

---

## Understanding the Layout

Rhozly has three persistent navigation zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: [≡ Menu] [Logo] [🏡 Home Name ▾] [+] [👤 Profile ▾]   │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                       │
│ SIDEBAR  │                  MAIN CONTENT                         │
│          │                                                       │
│ Dashboard│                                                       │
│ Plants   │                                                       │
│ Planner  │                                                       │
│ Journal  │                                                       │
│ Notes    │                                                       │
│ Tools    │                                                       │
│ Integr.  │                                                       │
└──────────┴──────────────────────────────────────────────────────┘
```

### Header

The header is always visible at the top of the screen.

| Element | What it does |
|---------|-------------|
| **≡ Menu** | Collapses or expands the sidebar (desktop) / opens drawer (mobile) |
| **Logo** | Always visible; tap to return to Dashboard |
| **Home Name ▾** | Shows your current home; tap to switch homes or add a new one |
| **+ (Quick Add)** | Opens the global quick-add menu — fastest way to create any item |
| **👤 Profile ▾** | Shows your name, subscription tier, email; tap to log out or access settings |

### Sidebar Navigation

The sidebar has these destinations:

| Icon | Label | What you'll find there |
|------|-------|------------------------|
| 🏠 | **Dashboard** | Garden overview, tasks, weather, Today Focus, Week Ahead preview, Seasonal Picks |
| 🌿 | **Plants** | Your plant inventory (The Shed) and the Ailment Watchlist |
| 📋 | **Planner** | Garden plans and Shopping lists |
| 📖 | **Journal** | Your garden journal — a timeline of photos and entries |
| 📝 | **Notes** | A rich-text garden notebook |
| 🔧 | **Tools** | Plant Doctor (with Voice), Visualiser, Sun Tracker, Light Sensor, Guides, Companion Planting, Garden Layout, Weekly Overview |
| 🔌 | **Integrations** | Smart-home devices and automations |

On **mobile** a **Quick** shortcut also appears for fast one-handed access, and the sidebar collapses to icons only. On **desktop** it can be expanded to show labels, or collapsed to icon-only mode — your preference is remembered.

![The expanded desktop sidebar showing the navigation items with labels](/doc-images/01-getting-started-04-sidebar.webp)

### Quick Access Home (Mobile)

When you visit any `/quick/*` route on mobile (e.g. via a push notification, share extension, or shortcut), Rhozly switches into a **focus-mode shell** — a stripped-down layout designed for one-handed use. The full nav returns the moment you tap back to the main dashboard.

---

## Navigating the App

- Tap any **sidebar item** to go to that section.
- Many sections have **sub-tabs** at the top of the page (e.g. Active / Archived in the Shed, or Plans / Shopping in the Planner).
- Use the **browser back button** or the **← Back** button (where shown) to return to the previous screen.
- The **+ Quick Add** button in the header is a shortcut from anywhere in the app — see [Global Quick Add](./15-navigation-quick-add.md#global-quick-add).

---

## Multi-User Homes

Rhozly supports multiple people working in the same home. If you are invited to a home by another user:

- You will see their tasks, plants, and locations.
- Your **permissions** (what you can create, edit, or delete) are set by the home owner.
- Tasks can be **assigned** to specific home members.
- You can filter the task list to show only **Mine** or **Assigned to me**.

---

## App Updates

Rhozly is a Progressive Web App (PWA). Updates are downloaded automatically in the background. When a new version is ready you will see a brief notification — no manual update required.
