import { Link } from "react-router-dom";
import { Check, Lock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppCard as Card } from "@/components/app/AppCard";
import { useGamePlans } from "@/features/team-tactics/api";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "./onboardingFlag";

const STEPS = [
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

export function RoadToKickoffCard({
  userId,
  activeAthletesCount,
}: {
  userId: string;
  activeAthletesCount: number;
}) {
  const { data: gamePlans } = useGamePlans();
  const playersAdded = activeAthletesCount > 0;
  const hasGamePlan = (gamePlans?.length ?? 0) > 0;

  const stepStates: StepState[] = [
    "done",
    playersAdded ? "done" : "current",
    playersAdded ? (hasGamePlan ? "done" : "current") : "locked",
  ];

  const stage = !playersAdded ? 2 : !hasGamePlan ? 3 : "complete";

  const copy =
    stage === 2
      ? {
          heading: "Next up: add your players",
          body: "Build your squad so you can pick your XI and plan matches.",
        }
      : stage === 3
        ? {
            heading: "Next up: pick your XI",
            body: "Choose a formation and save your first game plan on the Team page.",
          }
        : {
            heading: "You're ready for kick-off",
            body: "Your squad and game plan are set. Schedule your first match whenever you're ready.",
          };

  return (
    <Card
      aria-labelledby="road-to-kickoff-heading"
      className="animate-fade-in-scale w-full rounded-[20px] border-primary/40 px-5 py-5 motion-reduce:animate-none sm:px-8 sm:py-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
        Road to kick-off
      </p>
      <h2
        id="road-to-kickoff-heading"
        className="mt-2 font-display text-xl font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-2xl"
      >
        {copy.heading}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {copy.body}
      </p>

      <ol
        aria-label="Road to kick-off"
        className="mx-auto mt-5 flex w-full max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:gap-0"
      >
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const state = stepStates[index];
          const isLast = index === STEPS.length - 1;
          const leftLine =
            index === 0 ? "none" : connectorTo(stepStates[index]);
          const rightLine = isLast
            ? "none"
            : connectorTo(stepStates[index + 1]);
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
                    "relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
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

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        {stage === 2 && (
          <Link to="/athletes" className={cn(buttonVariants())}>
            Add players
          </Link>
        )}
        {stage === 3 && (
          <Link to="/team" className={cn(buttonVariants())}>
            Pick your XI
          </Link>
        )}
        {stage === "complete" && (
          <>
            <Link
              to="/events"
              className={cn(buttonVariants())}
              onClick={() => completeOnboarding(userId)}
            >
              Schedule a match
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => completeOnboarding(userId)}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
