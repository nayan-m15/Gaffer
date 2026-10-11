import { createContext, useContext } from "react";
import type { PageTourKey } from "./pageTourDefinitions";

export interface PageTourContextValue {
  pageTourKey: PageTourKey | null;
  startPageTour: () => void;
}

export const PageTourContext = createContext<PageTourContextValue>({
  pageTourKey: null,
  startPageTour: () => {},
});

export function usePageTour(): PageTourContextValue {
  return useContext(PageTourContext);
}
