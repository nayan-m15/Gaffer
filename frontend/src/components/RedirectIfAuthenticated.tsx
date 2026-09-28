import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Wraps public pages a signed-in visitor has no reason to see — the `/`
 * landing page. Once the session check settles and the visitor has a session
 * from the server, they are sent straight to the relevant workspace instead
 * of the marketing page. Cached offline state alone does not trigger this
 * redirect because it cannot confirm the current account session.
 *
 * The wrapped page renders while the session is still loading — public
 * visitors must not wait on the auth request — and the redirect only fires
 * once a session is positively established. Unauthenticated visitors, and
 * visitors whose session can't be verified because the server is
 * unreachable, keep seeing the public page.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, accountKind } = useAuth();

  if (status === "authenticated") {
    return (
      <Navigate
        to={accountKind === "player" ? "/player/dashboard" : "/dashboard"}
        replace
      />
    );
  }

  return <>{children}</>;
}
