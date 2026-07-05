# Navigation & Quick Add

This guide covers the persistent navigation elements that are available everywhere in Rhozly — the header bar, the sidebar, the home switcher, and the global quick-add menu.

---

## The Header Bar

The header is pinned to the top of the screen on every page.

![The header bar — menu toggle, logo, home dropdown, search, quick-add (+), and profile](/doc-images/15-navigation-quick-add-11-header.webp)

```
[ ≡ Menu ] [ Logo ] [ 🏡 Home Name ▾ ]  ──────────  [ + ] [ 👤 Name ▾ ]
```

| Element | Description |
|---------|-------------|
| **≡ Menu** | Toggles the sidebar open/closed |
| **Logo** | Rhozly logo — tap to return to the Dashboard |
| **Home Name ▾** | Shows your current home; opens the home switcher |
| **+ (Quick Add)** | Opens the global quick-add menu |
| **👤 Name ▾** | Profile dropdown with logout, subscription info, and settings |

---

## Sidebar Navigation

The sidebar provides the main navigation between sections.

![The expanded sidebar with the navigation items labelled and the Help Center / privacy buttons at the bottom](/doc-images/01-getting-started-04-sidebar.webp)

### Main Navigation Items

| Icon | Label | What's there |
|------|-------|-------------|
| 🏠 | **Dashboard** | Garden overview, weather, tasks, calendar, Today Focus, Week Ahead, Seasonal Picks |
| 🌿 | **Garden** | The Shed (plants), Nursery, Notes, Ailment Watchlist |
| 📋 | **Plan** | Garden plans + Shopping lists |
| 🔧 | **Tools** | Plant Lens, Visualiser, Sun Tracker, Light Sensor, Garden Layout, Companion Planting, Weekly Overview, Guides |

### Footer Items

At the bottom of the sidebar:
- **Help Centre** — opens support resources
- **Privacy Policy** — opens the privacy policy
- **Cookie Policy** — opens the cookie policy

### Collapsing the Sidebar

**Desktop:** Click the collapse toggle (arrow icon at the bottom of the sidebar) to switch between expanded (shows icons + labels) and collapsed (icons only) mode. Your preference is saved.

**Mobile:** The sidebar auto-collapses. Tap the **≡ Menu** button in the header to open it as a drawer, then tap any item or tap outside to close.

---

## Home Switcher

If you belong to more than one home (your own garden plus a family member's, or a community allotment), the **Home Switcher** lets you move between them.

![The home switcher dropdown with the active home and a "Create New Home" option](/doc-images/15-navigation-quick-add-61-home-switcher.webp)

Tap the **Home Name ▾** button in the header to open the switcher.

| Action | How |
|--------|-----|
| **Switch home** | Tap any home in the list |
| **Add a new home** | Tap **+ Add Home** at the bottom of the list |

When you switch homes, Rhozly:
- Clears the current cache
- Reloads all data (plants, tasks, locations) for the new home
- Updates the header to show the new home name

### Home Permissions

Each home has its own permissions system. The home owner can control what other members can do — for example, whether they can create tasks, delete plants, or manage locations. If you find you can't perform an action, your home owner may need to grant you that permission.

---

## Quick Launcher (formerly "Global Quick Add")

The **+** button in the header opens the **Quick Launcher** — a customisable sheet of shortcuts that lets you create or jump to anything without leaving the current page.

![The Quick Add menu — create a task, plant, plan, location, ailment, and more from anywhere](/doc-images/15-navigation-quick-add-01-menu.webp)

### The Tile Catalogue (16 destinations)

| Tile | Where it takes you |
|------|--------------------|
| **Today Focus** | Highlights today's priorities |
| **Add Task** | Schedule → Add task form |
| **Add Plant** | The Shed → Add plant form |
| **Plant Lens** | Camera + AI diagnosis |
| **Notes** | New blank note |
| **Week Ahead** | Weekly Overview page |
| **Watering** | Today's watering tasks, filtered |
| **Walk** | Start a Garden Walk |
| **Nursery** | Garden → Nursery tab |
| **Shopping List** | Active shopping list |
| **Garden AI** | Chat with Rhozly AI |
| **Areas** | Location Manager |
| **Plans** | Planner |
| **Visualiser** | Plant Visualiser |
| **Sun Tracker** | Sun trajectory AR |
| **Guides** | Knowledge base |

You can pick which 8 (or more) tiles appear, and in what order, under **Profile → Quick Launcher** — see [Profile & Preferences](./14-profile-preferences.md#quick-launcher-customisation).

The menu closes automatically after you tap a tile, or tap anywhere outside the menu (or press **Escape**) to dismiss it without taking any action.

### Quick Access Home (Mobile)

When you open Rhozly on mobile to a `/quick/*` URL — for example via a notification or a shared link — the app drops into the **Quick Access Home**, a stripped-back focus mode that shows just the relevant tile (or a small set of tiles) without the rest of the nav. Tap the back button to return to the full app.

---

## User Profile Dropdown

Tap the **👤 Name ▾** button on the right of the header.

![The profile dropdown showing the user's name, email, subscription badge, and a Log Out button](/doc-images/15-navigation-quick-add-71-profile-dropdown.webp)

| Element | Description |
|---------|-------------|
| **Display name** | Your account name |
| **Subscription tier** | Your current plan badge |
| **Email** | Your account email address |
| **Log Out** | Signs you out and returns to the sign-in screen |
| **Settings** | Visible to admins — opens home management settings |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Escape** | Closes any open menu, modal, or dropdown |
| **Enter / Space** | Activates the focused button or selects a focused item |
| **Tab** | Moves focus through interactive elements |
| **Arrow keys** | Moves through dropdown options (e.g. tag filter in Guides) |

---

## Deep Links

Many actions in Rhozly use URL parameters to directly open specific modals or flows. These work whether you type the URL directly, use a bookmark, or follow a link shared by someone.

| URL | What opens |
|-----|-----------|
| `/schedule?open=add-task` | Opens the add task form |
| `/shed?open=add-plant` | Opens the add plant form |
| `/planner?open=new-plan` | Opens the new plan form |
| `/management?open=add-location` | Opens the add location form |
| `/shed?tab=watchlist&open=add-ailment` | Opens the Watchlist with the add ailment form |
| `/guides?tab=community&open=new-guide` | Opens Community Guides with the guide editor |

This is the same mechanism used by the Global Quick Add button — useful if you want to bookmark a frequently-used action.
