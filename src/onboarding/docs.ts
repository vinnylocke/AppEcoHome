import gettingStarted from "../../documentation/01-getting-started.md?raw";
import dashboard from "../../documentation/02-dashboard.md?raw";
import tasks from "../../documentation/03-tasks.md?raw";
import schedule from "../../documentation/04-schedule.md?raw";
import theShed from "../../documentation/05-the-shed.md?raw";
import planner from "../../documentation/06-planner.md?raw";
import shoppingLists from "../../documentation/07-shopping-lists.md?raw";
import plantDoctor from "../../documentation/08-plant-doctor.md?raw";
import locationsAreas from "../../documentation/09-locations-areas.md?raw";
import weather from "../../documentation/10-weather-intelligence.md?raw";
import ailments from "../../documentation/11-ailment-watchlist.md?raw";
import guides from "../../documentation/12-guides.md?raw";
import tools from "../../documentation/13-tools.md?raw";
import profile from "../../documentation/14-profile-preferences.md?raw";
import navigation from "../../documentation/15-navigation-quick-add.md?raw";

export interface DocEntry {
  id: string;
  title: string;
  description: string;
  content: string;
}

export const DOCS: DocEntry[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Creating an account, setting up your first home, and understanding the app layout.",
    content: gettingStarted,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Locations view, Calendar view, Weather view, and the daily task sidebar.",
    content: dashboard,
  },
  {
    id: "tasks",
    title: "Tasks",
    description: "Creating, completing, postponing, bulk editing, and the task detail modal.",
    content: tasks,
  },
  {
    id: "schedule",
    title: "Schedule & Recurring Tasks",
    description: "Creating and managing automation blueprints for repeating care routines.",
    content: schedule,
  },
  {
    id: "the-shed",
    title: "The Shed — Plant Inventory",
    description: "Adding plants, managing instances, archiving, and bulk searching.",
    content: theShed,
  },
  {
    id: "planner",
    title: "Garden Planner",
    description: "Creating AI-generated garden plans and staging tasks.",
    content: planner,
  },
  {
    id: "shopping-lists",
    title: "Shopping Lists",
    description: "Creating lists, adding items, and tracking suggested supplies.",
    content: shoppingLists,
  },
  {
    id: "plant-doctor",
    title: "Plant Doctor (AI)",
    description: "Identifying plants and diagnosing diseases and pests using AI.",
    content: plantDoctor,
  },
  {
    id: "locations-areas",
    title: "Locations & Areas",
    description: "Setting up your garden structure, locations, areas, and growing conditions.",
    content: locationsAreas,
  },
  {
    id: "weather-intelligence",
    title: "Weather & Garden Intelligence",
    description: "Weather widget, 7-day forecast, alerts, and rain-aware watering rules.",
    content: weather,
  },
  {
    id: "ailment-watchlist",
    title: "Ailment Watchlist",
    description: "Tracking and managing pests, diseases, and invasive plants.",
    content: ailments,
  },
  {
    id: "guides",
    title: "Guides",
    description: "Browsing Rhozly guides and reading or writing community guides.",
    content: guides,
  },
  {
    id: "tools",
    title: "Tools",
    description: "Plant Visualiser, Light Sensor, and Sun Tracker.",
    content: tools,
  },
  {
    id: "profile-preferences",
    title: "Profile & Preferences",
    description: "Habit quiz, plant preference swiping, and AI personalisation.",
    content: profile,
  },
  {
    id: "navigation-quick-add",
    title: "Navigation & Quick Add",
    description: "Moving around the app, the global '+' menu, and switching homes.",
    content: navigation,
  },
];
