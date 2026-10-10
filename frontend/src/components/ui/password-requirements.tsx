import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { getPasswordRequirements } from "@/lib/password-policy";

interface PasswordRequirementsProps {
  password: string;
  className?: string;
}

export function PasswordRequirements({ password, className }: PasswordRequirementsProps) {
  const requirements = getPasswordRequirements(password);

  return (
    <div className={cn("grid gap-1.5 text-xs sm:grid-cols-2", className)} aria-live="polite">
      {requirements.map((requirement) => {
        const Icon = requirement.met ? CheckCircle2 : XCircle;
        return (
          <div
            key={requirement.key}
            className={cn(
              "flex items-center gap-1.5",
              requirement.met ? "text-brand" : "text-destructive",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{requirement.label}</span>
          </div>
        );
      })}
    </div>
  );
}
