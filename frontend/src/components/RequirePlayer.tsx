import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps pages that require the signed-in user to have at least one claimed
 * athlete profile (i.e. they are a player, not a coach or brand-new account).
 *
 * Must be nested inside `ProtectedRoute` — it assumes `status` is already
 * settled and doesn't handle the signed-out case itself.
 */
export function RequirePlayer({ children }: { children: ReactNode }) {
  const { claimedAthletes } = useAuth();

  if (claimedAthletes.length === 0) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
