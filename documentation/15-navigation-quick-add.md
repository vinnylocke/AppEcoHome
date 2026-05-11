# Navigation & Quick Add

This guide covers the persistent navigation elements that are available everywhere in Rhozly — the header bar, the sidebar, the home switcher, and the global quick-add menu.

---

## The Header Bar

The header is pinned to the top of the screen on every page.

> 📸 Screenshot: The full header bar showing the menu toggle, logo, home dropdown, plus button, and profile dropdown

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

> 📸 Screenshot: The expanded sidebar with four navigation items labelled and the help/privacy buttons at the bottom

### Main Navigation Items

| Icon | Label | What's there |
|------|-------|-------------|
| 🏠 | **Dashboard** | Garden overview, weather, tasks, calendar |
| 🌿 | **Garden** | The Shed (plants) + Ailment Watchlist |
| 📋 | **Plan** | Garden plans + Shopping lists |
| 🔧 | **Tools** | Plant Doctor, Visualiser, Light Sensor, Guides, Sun Tracker |

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

> 📸 Screenshot: The home switcher dropdown showing two homes listed with a checkmark on the active one, and an "Add new home" button at the bottom

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

## Global Quick Add

The **+** button in the header is the fastest way to create anything in Rhozly — you can use it from any screen without navigating away.

> 📸 Screenshot: The Quick Add menu open, showing six options with icons

Tap **+** to open the menu, then tap an option:

| Option | Where it takes you | What opens |
|--------|--------------------|-----------|
| **Create Task** | Schedule page | Add task form |
| **Add Plant** | The Shed | Add plant form |
| **Create Plan** | Planner | New plan form |
| **Create Location** | Location Manager | Add location form |
| **Log Ailment** | Ailment Watchlist | Add ailment form |
| **Create Guide** | Community Guides | Guide editor |

The menu closes automatically after you tap an option, or tap anywhere outside the menu (or press **Escape**) to dismiss it without taking any action.

---

## User Profile Dropdown

Tap the **👤 Name ▾** button on the right of the header.

> 📸 Screenshot: The profile dropdown showing the user's name, email, subscription badge, and a Log Out button

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
