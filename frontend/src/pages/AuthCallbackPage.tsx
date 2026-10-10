import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useAuth } from "@/hooks/useAuth";

function getDestination(accountKind: "coach" | "player" | "new", requested: string) {
  // A plain root destination should resolve to the right workspace for the
  // account. Any other stored path is constrained to a same-origin app path.
  if (requested === "/") {
    return accountKind === "player" ? "/player/dashboard" : "/dashboard";
  }
  if (
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\")
  ) {
    return requested;
  }
  return accountKind === "player" ? "/player/dashboard" : "/dashboard";
}

export default function AuthCallbackPage() {
  const { status, accountKind, retrySession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status !== "authenticated") return;
    const requested = sessionStorage.getItem("gaffer-google-callback-path") ?? "/dashboard";
    sessionStorage.removeItem("gaffer-google-callback-path");
    navigate(getDestination(accountKind, requested), { replace: true });
  }, [status, accountKind, navigate]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex items-center gap-3 text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Finishing sign in…
        </div>
      </main>
    );
  }

  if (status === "authenticated") return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sign in could not be completed</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          We couldn’t verify your Google session. Please try again.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => void retrySession()}>Retry</Button>
        <Link to="/login" className={buttonVariants({ variant: "outline" })}>
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
