import { useAuth } from "@/hooks/useAuth";

/**
 * DashboardPage — currently a minimal authenticated shell.
 *
 * Only proves out S1-02 (route protection + sign-out); the real dashboard
 * summary (active athletes, events, upcoming schedule) is S1-05 scope.
 * Chrome (sidebar / sign-out) lives in `AppShell`.
 */
export default function DashboardPage() {
  const { user, team } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-foreground">
        Welcome back{user ? `, ${user.name}` : ""}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {team ? `Coaching ${team.name}` : "Your team dashboard"}
      </p>
    </div>
  );
}
