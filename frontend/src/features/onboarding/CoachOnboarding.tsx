import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { START_TOUR_STORAGE_KEY, TOUR_FOCUS_DELAY_MS } from "./constants";
import { destroyCoachTour, startCoachTour } from "./startTour";
import "driver.js/dist/driver.css";
import "./tour.css";

function firstNameFrom(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Coach";
}

export function useCoachOnboardingTour() {
  const { team, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!team) return;
    if (sessionStorage.getItem(START_TOUR_STORAGE_KEY) !== "1") return;

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

export function CoachOnboarding() {
  useCoachOnboardingTour();

  useEffect(() => () => destroyCoachTour(), []);

  return null;
}
