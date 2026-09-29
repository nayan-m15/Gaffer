import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { CoachOnboarding } from "@/features/onboarding/CoachOnboarding";
import { UnlockGateCard } from "@/features/onboarding/UnlockGateCard";
import { useOnboardingRoadActive } from "@/features/onboarding/onboardingFlag";
import { cancelGoalUnlockCelebration } from "@/features/onboarding/goalUnlockCelebration";
import {
  usePageCelebrated,
  useUnlockRequirements,
  pageRequirementsMet,
  type UnlockPageKey,
} from "@/features/onboarding/unlocks";
import { SportLogo } from "@/components/brand/SportLogo";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const StadiumScene = lazy(() =>
  import("@/components/dashboard/StadiumScene").then((module) => ({
    default: module.StadiumScene,
  })),
);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function pageKeyFromPath(pathname: string): UnlockPageKey | null {
  const path = normalizePath(pathname);

  if (/^\/events\/[^/]+\/confirm-squad(\/|$)/.test(path)) {
    return "live-logger";
  }
  if (path === "/live-logger" || path.startsWith("/live-logger/")) {
    return "live-logger";
  }
  if (path === "/matches" || path.startsWith("/matches/")) {
    return "live-logger";
  }
  if (path === "/events" || path.startsWith("/events/")) {
    return "events";
  }
  if (path === "/injuries" || path.startsWith("/injuries/")) {
    return "injuries";
  }
  if (path === "/statistics" || path.startsWith("/statistics/")) {
    return "statistics";
  }
  if (path === "/team" || path.startsWith("/team/")) {
    return "team";
  }
  return null;
}

function GatedPageBody({
  pageKey,
  userId,
  showingGate,
  celebrating,
  onUnlocked,
  onRevealed,
}: {
  pageKey: UnlockPageKey;
  userId: string;
  showingGate: boolean;
  celebrating: boolean;
  onUnlocked: () => void;
  onRevealed: () => void;
}) {
  const { hasPlayers, hasGamePlan, isLoading } = useUnlockRequirements();
  const unlocked = pageRequirementsMet(pageKey, hasPlayers, hasGamePlan);
  const showSpinner = showingGate && isLoading;
  const showCard = showingGate && !isLoading;
  const showOutlet = !showingGate || unlocked;
  const outletInert = showingGate && unlocked;

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      {showOutlet && (
        <div
          className={cn(
            showCard && "absolute inset-0 overflow-hidden",
            outletInert &&
              "pointer-events-none overflow-hidden opacity-0 [clip-path:inset(100%)] [contain:strict] [content-visibility:hidden]",
          )}
          aria-hidden={outletInert || undefined}
          inert={outletInert || undefined}
        >
          <Outlet />
        </div>
      )}
      {showSpinner && (
        <div className="flex min-h-full flex-1 items-center justify-center py-16">
          <Loader2
            className="size-6 animate-spin text-primary motion-reduce:animate-none"
            role="status"
            aria-label="Loading"
          />
        </div>
      )}
      {showCard && (
        <div
          className={cn(
            "relative z-10 flex min-h-full flex-1 items-center justify-center px-6 py-8",
            celebrating && "pointer-events-none",
          )}
        >
          <UnlockGateCard
            pageKey={pageKey}
            userId={userId}
            hasPlayers={hasPlayers}
            hasGamePlan={hasGamePlan}
            exiting={celebrating}
            onUnlocked={onUnlocked}
            onRevealed={onRevealed}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Authenticated app chrome: responsive sidebar + main outlet.
 *
 * Shared by dashboard, roster, and events so navigation is always
 * present after sign-in.
 */
export function AppShell() {
  return (
    <SidebarProvider>
      <AppShellContent />
    </SidebarProvider>
  );
}

function AppShellContent() {
  const { expanded } = useSidebar();
  const { pathname } = useLocation();
  const { user, team } = useAuth();
  const onboardingActive = useOnboardingRoadActive(user?.id);
  const pageKey = pageKeyFromPath(pathname);
  const celebrated = usePageCelebrated(user?.id, pageKey ?? "events");
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    setCelebrating(false);
    cancelGoalUnlockCelebration();
  }, [pageKey]);

  useEffect(
    () => () => {
      cancelGoalUnlockCelebration();
    },
    [],
  );

  const gateEligible = Boolean(
    pageKey &&
      user?.id &&
      team &&
      team.role === "coach" &&
      onboardingActive,
  );
  const showingGate = Boolean(gateEligible && pageKey && user?.id && (!celebrated || celebrating));

  const handleUnlocked = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;
    setCelebrating(true);
  };

  const handleRevealed = () => {
    setCelebrating(false);
  };

  const showDashboardScene =
    pathname === "/dashboard" || pathname === "/dashboard/";
  const isEventsPage = pathname === "/events" || pathname === "/events/";

  return (
    <div className="app-shell relative isolate flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className="no-print pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_32%),radial-gradient(circle_at_90%_12%,color-mix(in_oklab,var(--chart-2)_10%,transparent),transparent_26%)]"
        aria-hidden="true"
      />
      <div
        className="no-print pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:36px_36px]"
        aria-hidden="true"
      />
      {showDashboardScene && (
        <Suspense fallback={null}>
          <StadiumScene />
        </Suspense>
      )}

      <Sidebar />
      <CoachOnboarding />

      <main
        className={cn(
          "app-shell-main relative z-10 flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-300 motion-reduce:transition-none",
          isEventsPage ? "overflow-hidden" : "overflow-y-auto",
          expanded ? "lg:pl-72" : "lg:pl-24",
        )}
      >
      
        <div className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center justify-center border-b border-border/60 bg-background/75 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <SportLogo size={26} className="rounded-md" />
            <span className="font-display text-sm font-bold tracking-wide text-foreground">
              GAFFER
            </span>
          </div>
        </div>
        <div
          className={cn(
            "app-shell-content flex-1",
            isEventsPage && "min-h-0",
            showingGate && "relative flex min-h-0 flex-col overflow-y-auto",
          )}
        >
          {gateEligible && pageKey && user?.id ? (
            <GatedPageBody
              pageKey={pageKey}
              userId={user.id}
              showingGate={showingGate}
              celebrating={celebrating}
              onUnlocked={handleUnlocked}
              onRevealed={handleRevealed}
            />
          ) : (
            <Outlet />
          )}
        </div>
        <div className="no-print relative z-20">
          <Footer className={isEventsPage ? "mt-0 shrink-0 py-2 sm:py-3" : undefined} />
        </div>
      </main>
    </div>
  );
}
