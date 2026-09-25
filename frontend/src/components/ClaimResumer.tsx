import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { acceptClaim, clearPendingClaimToken, getPendingClaimToken } from "@/services/claims";

/**
 * Resumes an interrupted player claim after email verification.
 *
 * Mounted once near the root, inside the Router. Whenever auth status
 * flips to "authenticated" and a pending claim token exists in
 * localStorage (set by ClaimPage before sending the user off to verify
 * their email), this fires POST /claims/:token/accept and routes them
 * to the player dashboard — completing the flow that ClaimPage itself
 * couldn't, since no session existed at sign-up time.
 */
export function ClaimResumer() {
  const { status, refreshSession } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const attempted = useRef(false);

  useEffect(() => {
    if (pathname.startsWith("/join-competition/")) return;
    if (status !== "authenticated" || attempted.current) return;
    const token = getPendingClaimToken();
    if (!token) return;
    attempted.current = true;

    (async () => {
      try {
        await acceptClaim(token);
        clearPendingClaimToken();
        await refreshSession();
        navigate("/player/dashboard", { replace: true });
      } catch (err) {
        // Token may have since expired, been revoked, or already been used
        // some other way — don't keep retrying on every future login.
        clearPendingClaimToken();
        console.error("Failed to resume claim after verification:", err);
      }
    })();
  }, [status, refreshSession, navigate, pathname]);

  return null;
}