import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Lock, LockOpen } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppCard as Card } from "@/components/app/AppCard";
import { cn } from "@/lib/utils";
import { createCelebrationBurst } from "./celebrationBurst";
import "./tour.css";
import "./unlock-gate.css";
import {
  PAGE_UNLOCKS,
  markPageCelebrated,
  pageRequirementsMet,
  pageUnlockDescription,
  type UnlockPageKey,
} from "./unlocks";

const HERO_ENTER =
  "animate-fade-in-up [animation-duration:280ms] motion-reduce:animate-none";

const ROAD_STEPS = [
  { label: "Create your team" },
  { label: "Add your players" },
  { label: "Pick your XI" },
] as const;

type StepState = "done" | "current" | "locked";

function roadLineClass(variant: "none" | "active" | "muted" | "done") {
  if (variant === "none") {
    return "hidden h-[2px] flex-1 bg-transparent sm:block";
  }
  if (variant === "active") {
    return "hidden h-[2px] flex-1 animate-dash-flow motion-reduce:animate-none sm:block";
  }
  if (variant === "done") {
    return "hidden h-[2px] flex-1 bg-primary sm:block";
  }
  return "hidden h-[2px] flex-1 bg-border sm:block";
}

function stepAriaLabel(stepNumber: number, state: StepState, label: string) {
  if (state === "done") return `Step ${stepNumber}, done: ${label}`;
  if (state === "current") return `Step ${stepNumber}, current: ${label}`;
  return `Step ${stepNumber}, locked: ${label}`;
}

function connectorTo(destination: StepState): "active" | "muted" | "done" {
  if (destination === "current") return "active";
  if (destination === "done") return "done";
  return "muted";
}

function UnlockRoad({
  hasPlayers,
  hasGamePlan,
  needsGamePlan,
}: {
  hasPlayers: boolean;
  hasGamePlan: boolean;
  needsGamePlan: boolean;
}) {
  const steps = needsGamePlan ? ROAD_STEPS : ROAD_STEPS.slice(0, 2);
  const stepStates: StepState[] = needsGamePlan
    ? [
        "done",
        hasPlayers ? "done" : "current",
        hasPlayers ? (hasGamePlan ? "done" : "current") : "locked",
      ]
    : ["done", hasPlayers ? "done" : "current"];

  return (
    <ol
      aria-label="Road to kick-off"
      className={cn(
        "mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:gap-0",
        steps.length === 2 && "sm:mx-auto sm:max-w-[22rem]",
        HERO_ENTER,
        "[animation-delay:540ms]",
      )}
    >
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const state = stepStates[index];
        const isLast = index === steps.length - 1;
        const leftLine = index === 0 ? "none" : connectorTo(stepStates[index]);
        const rightLine = isLast ? "none" : connectorTo(stepStates[index + 1]);
        return (
          <li
            key={step.label}
            className="flex items-center gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:gap-0"
            aria-label={stepAriaLabel(stepNumber, state, step.label)}
            aria-current={state === "current" ? "step" : undefined}
          >
            <div className="flex items-center sm:w-full">
              <span className={roadLineClass(leftLine)} aria-hidden="true" />
              <span
                className={cn(
                  "relative flex size-[42px] shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  state === "locked"
                    ? "border border-border-subtle bg-muted text-muted-foreground"
                    : "bg-primary text-primary-foreground",
                )}
                aria-hidden="true"
              >
                {state === "current" && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {state === "done" ? (
                  <Check className="size-4" />
                ) : state === "locked" ? (
                  <Lock className="size-4" />
                ) : (
                  stepNumber
                )}
              </span>
              <span className={roadLineClass(rightLine)} aria-hidden="true" />
            </div>
            <span
              className={cn(
                "text-sm sm:mt-2 sm:px-1 sm:text-center",
                state === "locked"
                  ? "text-muted-foreground"
                  : "font-medium text-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UnlockMomentMark() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpened(true);
      return;
    }
    const timeoutId = window.setTimeout(() => setOpened(true), 40);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <span
      className="relative mx-auto mb-3 flex size-8 items-center justify-center text-primary"
      aria-hidden="true"
    >
      <Lock
        className={cn(
          "absolute size-6",
          opened && "unlock-gate-lock-out motion-reduce:animate-none",
        )}
      />
      <LockOpen
        className={cn(
          "absolute size-6",
          opened
            ? "unlock-gate-lock-in motion-reduce:animate-none"
            : "opacity-0",
        )}
      />
    </span>
  );
}

function ChecklistItem({
  label,
  done,
  action,
}: {
  label: string;
  done: boolean;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
      {done ? (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <span className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
        <span className="sr-only">{done ? ", done" : ", not done"}</span>
      </span>
      {!done && action}
    </li>
  );
}

export function UnlockGateCard({
  pageKey,
  userId,
  eyebrow: eyebrowOverride,
  hasPlayers,
  hasGamePlan,
  onUnlocked,
}: {
  pageKey: UnlockPageKey;
  userId: string;
  eyebrow?: string;
  hasPlayers: boolean;
  hasGamePlan: boolean;
  onUnlocked: () => void;
}) {
  const page = PAGE_UNLOCKS[pageKey];
  const unlocked = pageRequirementsMet(pageKey, hasPlayers, hasGamePlan);
  const burstHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!unlocked) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const host = burstHostRef.current;
    if (!host) return;
    const burst = createCelebrationBurst();
    burst.classList.add("unlock-gate-burst");
    host.append(burst);
    const timeoutId = window.setTimeout(() => burst.remove(), 1100);
    return () => {
      window.clearTimeout(timeoutId);
      burst.remove();
    };
  }, [unlocked]);

  const eyebrow = unlocked
    ? "Unlocked"
    : (eyebrowOverride ?? `${page.label} is locked`);
  const heading = unlocked
    ? `${page.label} unlocked!`
    : hasPlayers
      ? "Now pick your XI"
      : "Your squad is empty";
  const body = unlocked
    ? pageUnlockDescription(pageKey, hasGamePlan)
    : `Finish these steps to unlock ${page.label}.`;

  const primaryLockedTo = hasPlayers ? "/team" : "/athletes";
  const primaryLockedLabel = hasPlayers ? "Pick your XI" : "Add players";
  const primaryUnlockedLabel =
    pageKey === "dashboard" ? "Enter the dugout" : `Open ${page.label}`;

  const handleUnlockedClick = () => {
    markPageCelebrated(userId, pageKey);
    onUnlocked();
  };

  return (
    <div
      key={unlocked ? "unlocked" : "locked"}
      ref={burstHostRef}
      className={cn(
        "relative mx-auto w-full max-w-[600px] overflow-visible",
        "animate-fade-in-scale motion-reduce:animate-none",
        unlocked && "unlock-gate-glow motion-reduce:animate-none",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
      />
      <Card
        aria-labelledby="unlock-gate-heading"
        className="relative z-10 max-h-[min(40rem,calc(100dvh-5rem))] overflow-y-auto rounded-[20px] border-primary/40 bg-background/70 px-8 py-10 text-center sm:px-10 sm:py-12"
      >
        {unlocked && <UnlockMomentMark />}
        <p
          className={cn(
            "text-lg font-medium uppercase tracking-[0.2em] text-primary",
            HERO_ENTER,
            "animation-delay-150",
          )}
        >
          {eyebrow}
        </p>
        <h2
          id="unlock-gate-heading"
          className={cn(
            "mt-4 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[2.75rem]",
            HERO_ENTER,
            "[animation-delay:280ms]",
          )}
        >
          {heading}
        </h2>
        <p
          className={cn(
            "mx-auto mt-4 max-w-[420px] text-[15px] leading-relaxed text-muted-foreground sm:text-base",
            HERO_ENTER,
            "[animation-delay:410ms]",
          )}
        >
          {body}
        </p>

        {!unlocked && (
          <UnlockRoad
            hasPlayers={hasPlayers}
            hasGamePlan={hasGamePlan}
            needsGamePlan={page.needsGamePlan}
          />
        )}

        <div
          className={cn(
            "mx-auto mt-8 max-w-[420px]",
            HERO_ENTER,
            unlocked ? "[animation-delay:540ms]" : "[animation-delay:600ms]",
          )}
        >
          <h3
            id="unlock-checklist-heading"
            className="text-sm font-medium text-foreground"
          >
            To unlock {page.label}, complete:
          </h3>
          <ul
            aria-labelledby="unlock-checklist-heading"
            className="mt-3 flex flex-col gap-2"
          >
            <ChecklistItem label="Create your team" done />
            <ChecklistItem
              label="Add at least one player"
              done={hasPlayers}
              action={
                <Link
                  to="/athletes"
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "h-auto px-0",
                  )}
                >
                  Go to Roster
                </Link>
              }
            />
            {page.needsGamePlan && (
              <ChecklistItem
                label="Save your first game plan"
                done={hasGamePlan}
                action={
                  hasPlayers ? (
                    <Link
                      to="/team"
                      className={cn(
                        buttonVariants({ variant: "link", size: "sm" }),
                        "h-auto px-0",
                      )}
                    >
                      Go to Team
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      after adding players
                    </span>
                  )
                }
              />
            )}
          </ul>
        </div>

        {unlocked ? (
          <Button
            type="button"
            size="lg"
            className={cn(
              "mt-8 h-12 w-full px-6 text-base sm:w-auto",
              HERO_ENTER,
              "[animation-delay:670ms]",
            )}
            onClick={handleUnlockedClick}
          >
            {primaryUnlockedLabel}
            <ArrowRight
              className="size-4 transition-transform group-hover/button:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover/button:translate-x-0"
              aria-hidden="true"
            />
          </Button>
        ) : (
          <Link
            to={primaryLockedTo}
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-8 h-12 w-full px-6 text-base sm:w-auto",
              HERO_ENTER,
              "[animation-delay:670ms]",
            )}
          >
            {primaryLockedLabel}
            <ArrowRight
              className="size-4 transition-transform group-hover/button:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover/button:translate-x-0"
              aria-hidden="true"
            />
          </Link>
        )}

        {!unlocked && (
          <p
            className={cn(
              "mt-3 text-xs text-muted-foreground",
              HERO_ENTER,
              "[animation-delay:800ms]",
            )}
          >
            Roster and Leagues are open now.
          </p>
        )}
      </Card>
    </div>
  );
}
