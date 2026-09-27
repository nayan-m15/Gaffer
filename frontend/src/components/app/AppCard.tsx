import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

interface AppCardProps extends ComponentPropsWithoutRef<"section"> {
  interactive?: boolean;
}

/**
 * The shared information surface for authenticated views.
 *
 * It deliberately keeps motion opt-in so dense coaching workflows remain
 * calm, while still carrying the glass-and-border treatment used by the
 * Aceternity-inspired dashboard layouts.
 */
export function AppCard({
  className,
  interactive = false,
  ...props
}: AppCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-5 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.9)]",
        interactive &&
          "transition-[border-color,background-color,box-shadow,transform] duration-200 motion-reduce:transition-none hover:-translate-y-px hover:border-border-strong hover:bg-surface-nested hover:shadow-[0_18px_46px_-34px_rgba(0,0,0,0.95)] motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}
