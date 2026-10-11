import { useEffect } from "react";
import { destroyCoachTour, useCoachOnboardingTour } from "./startTour";
import "driver.js/dist/driver.css";
import "./tour.css";

export function CoachOnboarding() {
  useCoachOnboardingTour();

  useEffect(() => () => destroyCoachTour(), []);

  return null;
}
