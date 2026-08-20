import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps pages that require the signed-in coach to already have a team
 * (Roster, Events, Stats). Coaches without one yet are sent back to
 * `/dashboard`, where the "Add Team" button lives.
 *
 * Must be nested inside `ProtectedRoute` — it assumes `status` is already
 * settled and doesn't handle the signed-out case itself.
 */
export function RequireTeam({ children }: { children: ReactNode }) {
  const { team } = useAuth();

  if (!team) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}