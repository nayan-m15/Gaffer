import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { driver, type DriveStep, type Driver, type PopoverDOM } from "driver.js";
import { FaFutbol } from "react-icons/fa";
import { START_TOUR_STORAGE_KEY } from "./constants";
import {
  PAGE_TOURS,
  PAGE_TOUR_ASSISTANT_TEXT,
  PAGE_TOUR_LABELS,
  PAGE_TOUR_PRIMARY_TARGET,
  type PageTourKey,
} from "./pageTourDefinitions";
import { markPageTourSeen } from "./pageTourStorage";
import { isCoachTourActive, setPageTourActive } from "./tourLock";

type PageTourStepData = {
  stepNumber: number;
  stepTotal: number;
  pageLabel: string;
};

let activePageDriver: Driver | null = null;
let persistSeen = false;
let seenUserId: string | undefined;
let seenPageKey: PageTourKey | undefined;
let iconRoot: Root | null = null;

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

function isCssHidden(element: Element): boolean {
  let current: Element | null = element;
  while (current instanceof HTMLElement) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return true;
    current = current.parentElement;
  }
  return false;
}

function resolveTourTarget(attr: string): HTMLElement | "fallback" | undefined {
  const matches = document.querySelectorAll(`[data-tour="${attr}"]`);
  if (matches.length === 0) return undefined;

  for (const node of matches) {
    if (isElementVisible(node)) return node;
  }

  for (const node of matches) {
    if (isCssHidden(node)) return "fallback";
  }

  return undefined;
}

function focusTourPrimaryButton(popover: PopoverDOM) {
  queueMicrotask(() => {
    popover.nextButton.focus({ preventScroll: true });
  });
}

function unmountFutbolMark() {
  iconRoot?.unmount();
  iconRoot = null;
}

function decoratePagePopover(
  popover: PopoverDOM,
  data: PageTourStepData,
  tour: Driver,
) {
  const progress = document.createElement("p");
  progress.className = "gaffer-tour-progress";
  progress.textContent = `${data.pageLabel} tips · ${data.stepNumber} of ${data.stepTotal}`;
  popover.wrapper.insertBefore(progress, popover.title);

  const mark = document.createElement("span");
  mark.className = "gaffer-tour-futbol";
  mark.setAttribute("aria-hidden", "true");
  popover.wrapper.append(mark);
  unmountFutbolMark();
  iconRoot = createRoot(mark);
  iconRoot.render(createElement(FaFutbol));

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "gaffer-tour-skip";
  skip.textContent = "Skip this page";
  skip.addEventListener("click", () => tour.destroy());
  popover.footer.append(skip);
}

function pushResolvedStep(
  resolved: DriveStep[],
  def: { attr: string; title: string; description: string },
) {
  const target = resolveTourTarget(def.attr);
  if (!target) return;

  const step: DriveStep = {
    popover: {
      title: def.title,
      description: def.description,
      showButtons: ["next", "previous"],
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
    },
  };
  if (target !== "fallback") step.element = target;
  resolved.push(step);
}

function buildPageSteps(pageKey: PageTourKey): DriveStep[] {
  const pageLabel = PAGE_TOUR_LABELS[pageKey];
  const resolved: DriveStep[] = [];

  for (const def of PAGE_TOURS[pageKey]) {
    pushResolvedStep(resolved, def);
  }

  const assistantTarget = resolveTourTarget("ai-assistant");
  if (assistantTarget && assistantTarget !== "fallback") {
    pushResolvedStep(resolved, {
      attr: "ai-assistant",
      title: "Your assistant",
      description: PAGE_TOUR_ASSISTANT_TEXT[pageKey],
    });
  }

  pushResolvedStep(resolved, {
    attr: "page-help",
    title: "Need a refresher?",
    description: "Press ? any time to see these tips again.",
  });

  const stepTotal = resolved.length;
  resolved.forEach((step, index) => {
    const isLast = index === stepTotal - 1;
    if (step.popover) {
      step.popover.nextBtnText = isLast ? "Done" : "Next";
    }
    step.data = {
      stepNumber: index + 1,
      stepTotal,
      pageLabel,
    } satisfies PageTourStepData;
  });

  return resolved;
}

export function pageTourPrimaryTargetReady(pageKey: PageTourKey): boolean {
  return (
    document.querySelector(
      `[data-tour="${PAGE_TOUR_PRIMARY_TARGET[pageKey]}"]`,
    ) !== null
  );
}

export function destroyPageTour(options?: { persistSeen?: boolean }) {
  if (options && "persistSeen" in options) {
    persistSeen = Boolean(options.persistSeen);
  }
  const current = activePageDriver;
  activePageDriver = null;
  if (current?.isActive()) current.destroy();
  else {
    setPageTourActive(false);
    unmountFutbolMark();
  }
}

export function startPageTour(options: {
  pageKey: PageTourKey;
  userId: string;
}): boolean {
  if (isCoachTourActive()) return false;
  if (sessionStorage.getItem(START_TOUR_STORAGE_KEY) === "1") return false;

  destroyPageTour({ persistSeen: false });

  const steps = buildPageSteps(options.pageKey);
  if (steps.length === 0) return false;

  persistSeen = true;
  seenUserId = options.userId;
  seenPageKey = options.pageKey;

  const reduceMotion = prefersReducedMotion();
  const tour = driver({
    steps,
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
      const data = opts.state.activeStep?.data as PageTourStepData | undefined;
      if (data) decoratePagePopover(popover, data, tour);
      focusTourPrimaryButton(popover);
    },
    onDestroyed: () => {
      unmountFutbolMark();
      setPageTourActive(false);
      if (activePageDriver === tour) activePageDriver = null;
      if (persistSeen && seenUserId && seenPageKey) {
        markPageTourSeen(seenUserId, seenPageKey);
      }
    },
  });

  activePageDriver = tour;
  setPageTourActive(true);
  tour.drive(0);
  return true;
}
