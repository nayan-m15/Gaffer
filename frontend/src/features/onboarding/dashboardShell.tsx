import type { ReactNode } from "react";
import {
  DashboardShellContext,
  type DashboardShellApi,
} from "./dashboardShellContext";

export function DashboardShellProvider({
  value,
  children,
}: {
  value: DashboardShellApi;
  children: ReactNode;
}) {
  return (
    <DashboardShellContext.Provider value={value}>
      {children}
    </DashboardShellContext.Provider>
  );
}
