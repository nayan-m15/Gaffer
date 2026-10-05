import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { driver, type DriveStep, type Driver, type PopoverDOM } from "driver.js";
import { useAuth } from "@/hooks/useAuth";
import { START_TOUR_STORAGE_KEY, TOUR_FOCUS_DELAY_MS, TOUR_STEP_COUNT } from "./constants";
import { createCelebrationBurst } from "./celebrationBurst";
import { markOnboardingActive } from "./onboardingFlag";
import { destroyPageTour } from "./startPageTour";
import { setCoachTourActive } from "./tourLock";

export interface StartCoachTourOptions {
  teamName: string;
  firstName: string;
  replay?: boolean;
  onGoToRoster: () => void;
}

type TourStepData = {
  stepNumber: number;
  celebration?: boolean;
  showSkip?: boolean;
  maybeLater?: boolean;
};

const NAV_STEPS: Array<{
  attr: string;
  title: string;
  description: string;
}> = [
  {
    attr: "nav-dashboard",
    title: "Dashboard",
    description:
      "Your home base: upcoming events, recent results, and any match that's live.",
  },
  {
    attr: "nav-roster",
    title: "Roster",
    description:
      "Add your players and keep their details up to date. You can invite assistants here too.",
  },
  {
    attr: "nav-events",
    title: "Events",
    description: "Schedule matches, training sessions, and meetings on the calendar.",
  },
  {
    attr: "nav-live-logger",
    title: "Live Logger",
    description:
      "On match day, pick the match, confirm your squad, and log goals, cards, and subs as they happen.",
  },
  {
    attr: "nav-injuries",
    title: "Injuries",
    description: "Log injuries and track each player's recovery.",
  },
  {
    attr: "nav-stats",
    title: "Stats",
    description:
      "Season totals and player breakdowns, built from what you log in matches.",
  },
  {
    attr: "nav-competitions",
    title: "Leagues & Competitions",
    description: "Find, create, and manage leagues and cups.",
  },
  {
    attr: "nav-team",
    title: "Team",
    description:
      "Pick your lineup, formation, and tactics from the players in your roster.",
  },
];

const MOBILE_NAV_TARGET: Record<string, string> = {
  "nav-dashboard": "mobile-nav-dashboard",
  "nav-roster": "mobile-nav-menu",
  "nav-events": "mobile-nav-events",
  "nav-live-logger": "mobile-nav-live-logger",
  "nav-injuries": "mobile-nav-menu",
  "nav-stats": "mobile-nav-stats",
  "nav-competitions": "mobile-nav-menu",
  "nav-team": "mobile-nav-menu",
  "account-section": "mobile-nav-menu",
  "show-tour": "mobile-nav-menu",
};

const MENU_HINT = " Find it in the Menu.";

const PITCH_DOTS: Array<{ cx: number; cy: number }> = [
  { cx: 35, cy: 88 },
  { cx: 14, cy: 72 },
  { cx: 26, cy: 74 },
  { cx: 44, cy: 74 },
  { cx: 56, cy: 72 },
  { cx: 20, cy: 52 },
  { cx: 35, cy: 50 },
  { cx: 50, cy: 52 },
  { cx: 18, cy: 28 },
  { cx: 35, cy: 22 },
  { cx: 52, cy: 28 },
];

let activeDriver: Driver | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isElementVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

function clampMobileTourPopover(popover: PopoverDOM) {
  const found = popover.wrapper.closest(".driver-popover");
  const box = found instanceof HTMLElement ? found : popover.wrapper;
  requestAnimationFrame(() => {
    const rect = box.getBoundingClientRect();
    const topLimit = 64 + 8;
    const bottomLimit = window.innerHeight - 76 - 8;
    let top = rect.top;
    if (rect.bottom > bottomLimit) top -= rect.bottom - bottomLimit;
    if (top < topLimit) top = topLimit;
    const maxWidth = window.innerWidth - 24;
    const width = Math.min(rect.width, maxWidth);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
    if (left < 12) left = 12;
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
  });
}

function findVisibleTourTarget(attr: string): HTMLElement | undefined {
  const matches = document.querySelectorAll(`[data-tour="${attr}"]`);
  for (const node of matches) {
    if (isElementVisible(node)) return node;
  }
  return undefined;
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function createPitchBadge(litCount: number): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: "0 0 70 100",
    class: "gaffer-tour-pitch",
    "aria-hidden": "true",
    focusable: "false",
  }) as SVGSVGElement;

  svg.append(
    svgEl("rect", {
      x: "6",
      y: "6",
      width: "58",
      height: "88",
      rx: "2",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
    }),
    svgEl("line", {
      x1: "6",
      y1: "50",
      x2: "64",
      y2: "50",
      stroke: "currentColor",
      "stroke-width": "1.5",
    }),
    svgEl("circle", {
      cx: "35",
      cy: "50",
      r: "9",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
    }),
  );

  PITCH_DOTS.forEach((dot, index) => {
    const circle = svgEl("circle", {
      cx: String(dot.cx),
      cy: String(dot.cy),
      r: "3.2",
      class: index < litCount ? "gaffer-tour-pitch-dot is-lit" : "gaffer-tour-pitch-dot",
    });
    svg.append(circle);
  });

  return svg;
}

function decoratePopover(popover: PopoverDOM, stepNumber: number, data: TourStepData | undefined, tour: Driver) {
  const progress = document.createElement("p");
  progress.className = "gaffer-tour-progress";
  progress.textContent = `${stepNumber} of ${TOUR_STEP_COUNT}`;
  popover.wrapper.insertBefore(progress, popover.title);

  popover.wrapper.append(createPitchBadge(stepNumber));

  const keys = document.createElement("div");
  keys.className = "gaffer-tour-keys";
  keys.setAttribute("aria-hidden", "true");
  keys.innerHTML =
    `<span class="gaffer-tour-key">Enter</span><span>next</span>` +
    `<span class="gaffer-tour-key">Esc</span><span>close</span>`;
  popover.wrapper.insertBefore(keys, popover.footer);

  if (data?.showSkip) {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "gaffer-tour-skip";
    skip.textContent = "Skip tour";
    skip.addEventListener("click", () => tour.destroy());
    popover.footer.append(skip);
  }

  if (data?.maybeLater) {
    const later = document.createElement("button");
    later.type = "button";
    later.className = "driver-popover-footer-btn gaffer-tour-secondary";
    later.textContent = "Maybe later";
    later.addEventListener("click", () => tour.destroy());
    popover.footerButtons.append(later);
  }

  if (data?.celebration && !prefersReducedMotion()) {
    popover.wrapper.prepend(createCelebrationBurst());
  }
}

function focusTourPrimaryButton(popover: PopoverDOM) {
  queueMicrotask(() => {
    popover.nextButton.focus({ preventScroll: true });
  });
}

function buildSteps(options: StartCoachTourOptions, mobile: boolean): DriveStep[] {
  const team = escapeHtml(options.teamName);
  const first = escapeHtml(options.firstName);
  const showCelebration = !options.replay;

  const welcome: DriveStep = {
    popover: {
      title: `${team} is official`,
      description: `Welcome to the dugout, ${first}. Want a one-minute walk around the ground?`,
      showButtons: ["next"],
      nextBtnText: "Take the tour",
    },
    data: {
      stepNumber: 1,
      celebration: showCelebration,
      maybeLater: true,
    } satisfies TourStepData,
  };

  const navSteps: DriveStep[] = NAV_STEPS.map((step, index) => {
    const attr = mobile ? (MOBILE_NAV_TARGET[step.attr] ?? step.attr) : step.attr;
    const target = findVisibleTourTarget(attr);
    const stepConfig: DriveStep = {
      popover: {
        title: step.title,
        description:
          mobile && attr === "mobile-nav-menu"
            ? `${step.description}${MENU_HINT}`
            : step.description,
        showButtons: ["next", "previous"],
        nextBtnText: "Next",
        prevBtnText: "Back",
        side: mobile && target ? "top" : "right",
        align: "center",
      },
      data: {
        stepNumber: index + 2,
        showSkip: true,
      } satisfies TourStepData,
    };
    if (target) stepConfig.element = target;
    return stepConfig;
  });

  const accountAttr = mobile ? "mobile-nav-menu" : "account-section";
  const accountTarget = findVisibleTourTarget(accountAttr);
  const accountCopy =
    "Click your name to edit your details: name, phone number, sex, and date of birth. You can also switch between light and dark mode, replay this tour, or sign out here.";
  const accountStep: DriveStep = {
    ...(accountTarget ? { element: accountTarget } : {}),
    popover: {
      title: "Your account",
      description: mobile ? `${accountCopy}${MENU_HINT}` : accountCopy,
      showButtons: ["next", "previous"],
      nextBtnText: "Next",
      prevBtnText: "Back",
      side: mobile && accountTarget ? "top" : "right",
      align: "center",
    },
    data: {
      stepNumber: 10,
      showSkip: true,
    } satisfies TourStepData,
  };

  const finale: DriveStep = {
    popover: {
      title: "Full XI. You're ready.",
      description: "First job: add your players in Roster.",
      showButtons: ["next"],
      doneBtnText: "Go to Roster",
      nextBtnText: "Go to Roster",
    },
    data: {
      stepNumber: 11,
      celebration: showCelebration,
    } satisfies TourStepData,
  };

  return [welcome, ...navSteps, accountStep, finale];
}

export function destroyCoachTour() {
  const current = activeDriver;
  activeDriver = null;
  setCoachTourActive(false);
  if (current?.isActive()) current.destroy();
}

export function startCoachTour(options: StartCoachTourOptions) {
  destroyPageTour({ persistSeen: false });
  destroyCoachTour();
  sessionStorage.removeItem(START_TOUR_STORAGE_KEY);
  setCoachTourActive(true);

  const reduceMotion = prefersReducedMotion();
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  const tour = driver({
    steps: buildSteps(options, mobile),
    animate: !reduceMotion,
    duration: reduceMotion ? 0 : 400,
    allowClose: true,
    allowKeyboardControl: true,
    overlayColor: "#000",
    overlayOpacity: 0.58,
    stagePadding: 8,
    stageRadius: 12,
    popoverOffset: 12,
    disableActiveInteraction: true,
    skipMissingElement: false,
    showProgress: false,
    popoverClass: "gaffer-tour",
    overlayClickBehavior: () => {},
    onPopoverRender: (popover, opts) => {
      const data = opts.state.activeStep?.data as TourStepData | undefined;
      const stepNumber = data?.stepNumber ?? (opts.index ?? 0) + 1;
      decoratePopover(popover, stepNumber, data, tour);
      focusTourPrimaryButton(popover);
      if (mobile) clampMobileTourPopover(popover);
    },
    onDestroyed: () => {
      setCoachTourActive(false);
      if (activeDriver === tour) activeDriver = null;
    },
    onDoneClick: () => {
      tour.destroy();
      options.onGoToRoster();
    },
  });

  activeDriver = tour;
  tour.drive(options.replay ? 1 : 0);
}

function firstNameFrom(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Coach";
}

export function useCoachOnboardingTour() {
  const { team, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!team) return;
    if (sessionStorage.getItem(START_TOUR_STORAGE_KEY) !== "1") return;
    if (user?.id) markOnboardingActive(user.id);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeoutId = window.setTimeout(() => {
      if (sessionStorage.getItem(START_TOUR_STORAGE_KEY) !== "1") return;
      sessionStorage.removeItem(START_TOUR_STORAGE_KEY);
      startCoachTour({
        teamName: team.name,
        firstName: firstNameFrom(user?.name),
        replay: false,
        onGoToRoster: () => navigate("/athletes"),
      });
    }, reduceMotion ? 0 : TOUR_FOCUS_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [team, user, navigate]);
}
