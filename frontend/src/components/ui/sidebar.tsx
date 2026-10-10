import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { SidebarContext } from "@/hooks/useSidebar";

const STORAGE_KEY = "gaffer-sidebar-expanded";

/** Persisted application adaptation of Aceternity's collapsible sidebar. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(expanded));
  }, [expanded]);

  return (
    <SidebarContext.Provider
      value={{ expanded, setExpanded, toggle: () => setExpanded((value) => !value) }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
