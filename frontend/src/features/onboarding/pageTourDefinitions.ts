export type PageTourKey =
  | "roster"
  | "events"
  | "team"
  | "dashboard"
  | "live-logger"
  | "injuries"
  | "statistics"
  | "competitions";

export interface PageTourStepDef {
  attr: string;
  title: string;
  description: string;
}

export const PAGE_TOUR_LABELS: Record<PageTourKey, string> = {
  roster: "Roster",
  events: "Events",
  team: "Team",
  dashboard: "Dashboard",
  "live-logger": "Live Logger",
  injuries: "Injuries",
  statistics: "Stats",
  competitions: "Leagues & Competitions",
};

export const PAGE_TOUR_PRIMARY_TARGET: Record<PageTourKey, string> = {
  roster: "roster-table",
  events: "events-calendar",
  team: "team-pitch",
  dashboard: "dashboard-upcoming",
  "live-logger": "livelogger-matches",
  injuries: "injuries-log",
  statistics: "stats-overview",
  competitions: "competitions-mine",
};

export const PAGE_TOURS: Record<PageTourKey, readonly PageTourStepDef[]> = {
  roster: [
    {
      attr: "roster-add",
      title: "Add your players",
      description:
        "Add players to your squad here. Everyone you add can be picked for matches and training.",
    },
    {
      attr: "roster-tabs",
      title: "Active and archived",
      description:
        "Active players are your current squad. Archived players are kept for your records but left out of selection.",
    },
    {
      attr: "roster-search",
      title: "Find a player",
      description:
        "Search your squad by name, number, position, or status.",
    },
    {
      attr: "roster-table",
      title: "Your squad",
      description: "Your players at a glance.",
    },
    {
      attr: "roster-invite",
      title: "Bring in help",
      description:
        "Invite an assistant coach to help out. Assistants can see your roster, events, and stats.",
    },
  ],
  events: [
    {
      attr: "events-new",
      title: "Schedule something",
      description:
        "Add a match, a training session, or a meeting to the calendar.",
    },
    {
      attr: "events-views",
      title: "Change the view",
      description:
        "Switch between month, week, and agenda views. Larger screens use month and week.",
    },
    {
      attr: "events-calendar",
      title: "Your calendar",
      description: "Your events appear here. Select one to see its details.",
    },
  ],
  team: [
    {
      attr: "team-tabs",
      title: "Squad and tactics",
      description:
        "Pick your lineup in Squad, and set how you play in Tactics.",
    },
    {
      attr: "team-formation",
      title: "Choose a formation",
      description:
        "Pick a formation from the dropdowns, or use Auto-fill to fill the pitch from your squad.",
    },
    {
      attr: "team-pitch",
      title: "Set your XI",
      description: "Place players on the pitch to build your starting lineup.",
    },
    {
      attr: "team-subs",
      title: "Your bench",
      description: "Players here are your substitutes.",
    },
    {
      attr: "team-gameplan",
      title: "Save your game plan",
      description:
        "Save this lineup as a game plan. You can keep several and use one on match day.",
    },
  ],
  dashboard: [
    {
      attr: "dashboard-upcoming",
      title: "Coming up",
      description: "Your next matches, training sessions, and meetings.",
    },
    {
      attr: "dashboard-live",
      title: "Live match",
      description:
        "When a match is in progress, jump straight back into logging from here.",
    },
    {
      attr: "dashboard-season",
      title: "Your season",
      description:
        "Results, form, and season totals build up here as you log matches.",
    },
    {
      attr: "dashboard-quick",
      title: "Quick actions",
      description: "Shortcuts to the things you do most.",
    },
  ],
  "live-logger": [
    {
      attr: "livelogger-matches",
      title: "Your matches",
      description:
        "Scheduled matches appear here. On match day, pick one to confirm your squad and start logging.",
    },
    {
      attr: "livelogger-locked",
      title: "Match day only",
      description: "A match can only be started on the day it's scheduled.",
    },
  ],
  injuries: [
    {
      attr: "injuries-log",
      title: "Log an injury",
      description:
        "Record an injury by hand. Injuries logged during a live match show up here automatically.",
    },
    {
      attr: "injuries-tabs",
      title: "Overview and history",
      description:
        "Overview shows current injuries and recovery. History keeps every injury on record.",
    },
    {
      attr: "injuries-summary",
      title: "At a glance",
      description: "A quick count of your squad's injury situation.",
    },
    {
      attr: "injuries-body",
      title: "Track recovery",
      description:
        "See where each injury is and follow the player's recovery.",
    },
  ],
  statistics: [
    {
      attr: "stats-filters",
      title: "Filter your stats",
      description: "Narrow your stats down by season or competition.",
    },
    {
      attr: "stats-overview",
      title: "Team stats",
      description:
        "Your team's numbers appear here once you've logged a match.",
    },
    {
      attr: "stats-players",
      title: "Player stats",
      description: "Every player's numbers, side by side.",
    },
    {
      attr: "stats-seasons",
      title: "Seasons",
      description:
        "Create seasons to compare performance over a set period.",
    },
  ],
  competitions: [
    {
      attr: "competitions-create",
      title: "Start a competition",
      description: "Create your own league or cup.",
    },
    {
      attr: "competitions-mine",
      title: "Your competitions",
      description: "Leagues and cups your team is part of appear here.",
    },
    {
      attr: "competitions-find",
      title: "Find a competition",
      description: "Search for an existing league or cup by name.",
    },
  ],
};

export const PAGE_TOUR_ASSISTANT_TEXT: Record<PageTourKey, string> = {
  roster:
    "Ask the Gaffer assistant to help manage your roster, like adding players by describing them.",
  events: "Ask the Gaffer assistant for help with this page.",
  team: "Ask the Gaffer assistant to suggest a lineup, pick a formation, or compare players from your squad.",
  dashboard: "Ask the Gaffer assistant for help with this page.",
  "live-logger": "Ask the Gaffer assistant for help with this page.",
  injuries:
    "Ask the Gaffer assistant to record an injury, or to ask about a player's injuries and recovery.",
  statistics: "Ask the Gaffer assistant for help with this page.",
  competitions:
    "Ask the Gaffer assistant to create a league or cup for your team.",
};

export function pageTourKeyFromPath(pathname: string): PageTourKey | null {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (path === "/athletes") return "roster";
  if (path === "/events") return "events";
  if (path === "/team") return "team";
  if (path === "/dashboard") return "dashboard";
  if (path === "/live-logger") return "live-logger";
  if (path === "/injuries") return "injuries";
  if (path === "/statistics") return "statistics";
  if (path === "/competitions") return "competitions";
  return null;
}
