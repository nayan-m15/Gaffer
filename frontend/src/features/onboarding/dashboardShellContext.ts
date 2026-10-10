import { createContext, useContext } from "react";

export type DashboardShellApi = {
  /** Keep the dashboard slot and blur up once the celebration starts. */
  hold: () => void;
  /** Drop the slot lock and fade the blur with the celebration. */
  reveal: () => void;
};

export const DashboardShellContext = createContext<DashboardShellApi>({
  hold: () => {},
  reveal: () => {},
});

export function useDashboardShell(): DashboardShellApi {
  return useContext(DashboardShellContext);
}
