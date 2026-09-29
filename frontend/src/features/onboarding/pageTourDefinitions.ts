export type PageTourKey = "roster" | "events" | "team";

export interface PageTourStepDef {
  attr: string;
  title: string;
  description: string;
}

export const PAGE_TOUR_LABELS: Record<PageTourKey, string> = {
  roster: "Roster",
  events: "Events",
  team: "Team",
};

export const PAGE_TOUR_PRIMARY_TARGET: Record<PageTourKey, string> = {
  roster: "roster-table",
  events: "events-calendar",
  team: "team-pitch",
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
};

export const PAGE_TOUR_ASSISTANT_TEXT: Record<PageTourKey, string> = {
  roster:
    "Ask the Gaffer assistant to help manage your roster, like adding players by describing them.",
  events: "Ask the Gaffer assistant for help with this page.",
  team: "Ask the Gaffer assistant to suggest a lineup, pick a formation, or compare players from your squad.",
};

export function pageTourKeyFromPath(pathname: string): PageTourKey | null {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (path === "/athletes") return "roster";
  if (path === "/events") return "events";
  if (path === "/team") return "team";
  return null;
}
