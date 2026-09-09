import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  acceptTeamInvite,
  clearPendingTeamInviteToken,
  classifyInviteAcceptError,
  getPendingTeamInviteToken,
  type InviteAcceptFailureKind,
} from "@/services/team-invites";

interface InviteNotice {
  kind: InviteAcceptFailureKind;
  message: string;
  token: string;
}

/**
 * Resumes an interrupted assistant invite acceptance after email verification.
 *
 * Mounted once near the root, inside the Router. Whenever auth status flips
 * to "authenticated" and a pending team-invite token exists in localStorage
 * (set by JoinTeamPage before sending the user off to verify their email),
 * this fires POST /team-invites/:token/accept and routes them to the
 * dashboard — completing the flow that JoinTeamPage itself couldn't, since
 * no session existed at sign-up time.
 *
 * Unlike the original one-shot version, failures are classified instead of
 * being treated as "the invite is dead":
 * - definitive (expired/used/revoked/already-in-a-team): the token is
 *   dropped, but the user is still told what happened;
 * - email mismatch (403): the token is kept and the user is guided to sign
 *   out and sign back in with the invited email — signing in with the right
 *   account re-arms this resumer and retries automatically;
 * - transient (network/5xx): the token is kept and a retry is offered.
 */
export function TeamInviteResumer() {
  const { status, user, team, signOut, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const attempted = useRef(false);
  const [retryTick, setRetryTick] = useState(0);
  const [notice, setNotice] = useState<InviteNotice | null>(null);

  // Re-arm after sign-out so the next sign-in — ideally with the invited
  // email, after an email-mismatch 403 — retries the invitation automatically.
  useEffect(() => {
    if (status === "unauthenticated") {
      attempted.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // JoinTeamPage owns acceptance while the user is actually on the invite.
    if (location.pathname.startsWith("/join-team/")) return;
    // Already on a team: any pending token is stale, clean it up silently.
    if (team) {
      clearPendingTeamInviteToken();
      return;
    }
    if (attempted.current) return;

    const token = getPendingTeamInviteToken();
    if (!token) return;
    attempted.current = true;

    (async () => {
      try {
        await acceptTeamInvite(token);
        clearPendingTeamInviteToken();
        await refreshSession();
        navigate("/dashboard", { replace: true });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "We couldn't finish joining you to the team just now.";
        const kind = classifyInviteAcceptError(err);

        if (kind === "definitive") {
          // The invitation itself is unusable — drop it, but still tell the
          // user instead of failing silently like the old one-shot version.
          clearPendingTeamInviteToken();
        }
        // Transient and email-mismatch failures keep the token so the
        // invitation stays recoverable via retry or the invite link.
        setNotice({ kind, message, token });
      }
    })();
  }, [status, team, location.pathname, refreshSession, navigate, retryTick]);

  if (!notice) return null;
  // The invite page renders its own (fuller) guidance — hide the banner there.
  if (location.pathname.startsWith("/join-team/")) return null;

  const handleRetry = () => {
    setNotice(null);
    attempted.current = false;
    setRetryTick((tick) => tick + 1);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      // Keep the notice visible: it says to sign back in with the invited
      // email, and its link returns the user to the invitation.
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <div className="pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm font-medium text-foreground">{notice.message}</p>

        {notice.kind === "email-mismatch" && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            You&apos;re signed in as{" "}
            <span className="font-medium text-foreground">{user?.email}</span>,
            but this invite was issued to a different email address. Sign out
            and sign in with the invited email to join the team.
          </p>
        )}

        {notice.kind === "transient" && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your invitation is still waiting — this looks like a temporary
            problem, so you can try again in a moment.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {notice.kind === "transient" && (
            <Button size="sm" onClick={handleRetry}>
              Try again
            </Button>
          )}

          {notice.kind === "email-mismatch" && (
            <Button size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          )}

          {notice.kind !== "definitive" && (
            <Link
              to={`/join-team/${notice.token}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open your invite
            </Link>
          )}

          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
