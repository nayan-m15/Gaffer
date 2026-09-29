let coachTourActive = false;
let pageTourActive = false;

export function isCoachTourActive(): boolean {
  return coachTourActive;
}

export function setCoachTourActive(active: boolean): void {
  coachTourActive = active;
}

export function setPageTourActive(active: boolean): void {
  pageTourActive = active;
}

export function isPageTourActive(): boolean {
  return pageTourActive;
}
