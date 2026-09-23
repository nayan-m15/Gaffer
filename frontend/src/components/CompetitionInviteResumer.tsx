import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { buttonVariants } from "@/components/ui/button";
import { getPendingCompetitionInviteToken } from "@/services/competition-invites";

/** Restore the invitation explicitly, without accepting or interrupting another flow. */
export function CompetitionInviteResumer() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const token = getPendingCompetitionInviteToken();
  if (status !== "authenticated" || !token ||
      pathname.startsWith("/join-") || pathname.startsWith("/claim/") ||
      pathname === "/verify-email") return null;

  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
      <p className="text-sm">You have a pending competition invitation.</p>
      <Link className={buttonVariants({ variant: "outline", size: "sm" })}
        to={`/join-competition/${encodeURIComponent(token)}`}>Open invitation</Link>
    </div>
  );
}
