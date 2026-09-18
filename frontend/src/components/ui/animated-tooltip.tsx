import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface AnimatedTooltipProps {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Hover, focus, and touch-friendly adaptation of Aceternity's tooltip. */
export function AnimatedTooltip({
  label,
  description,
  children,
  className,
}: AnimatedTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <div aria-describedby={open ? tooltipId : undefined}>{children}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            id={tooltipId}
            role="tooltip"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-max max-w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-neutral-950/95 px-3 py-2 text-center shadow-xl backdrop-blur-xl"
          >
            <p className="text-xs font-semibold text-white">{label}</p>
            {description && (
              <p className="mt-0.5 text-[10px] text-neutral-300">{description}</p>
            )}
            <span className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/10 bg-neutral-950" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
