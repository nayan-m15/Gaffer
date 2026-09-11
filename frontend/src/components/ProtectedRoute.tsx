import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps pages that require a signed-in coach. Redirects unauthenticated
 * visitors to `/login`, preserving the page they tried to reach so login can
 * send them back afterward.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, sessionError, retrySession } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Service Unavailable
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {sessionError ??
              "We couldn't connect to the server to verify your session. Please check your network connection and try again."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retrySession()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
