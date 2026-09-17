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
        "overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-300 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_24px_70px_-42px_rgba(16,185,129,0.45)] motion-reduce:hover:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}
