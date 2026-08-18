import { useNavigate } from "react-router-dom";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * DashboardPage — currently a minimal authenticated shell.
 *
 * Only proves out S1-02 (route protection + sign-out); the real dashboard
 * summary (active athletes, events, upcoming schedule) is S1-05 scope.
 */
export default function DashboardPage() {
  const { user, team, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <SportLogo size={32} className="rounded-md" />
          <span className="font-display text-lg font-bold tracking-wide text-foreground">
            GAFFER
          </span>
        </div>
        <Button variant="outline" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </header>

      <div className="p-8">
        <h1 className="text-3xl font-semibold text-foreground">
          Welcome back{user ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {team ? `Coaching ${team.name}` : "Your team dashboard"}
        </p>
      </div>
    </main>
  );
}
