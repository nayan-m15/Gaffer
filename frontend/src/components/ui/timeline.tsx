import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  content: ReactNode;
  markerColor?: string;
  pending?: boolean;
}

interface TimelineProps {
  data: TimelineEntry[];
  className?: string;
}

/** Compact application adaptation of Aceternity's scroll timeline. */
export function Timeline({ data, className }: TimelineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <ol className={cn("relative", className)}>
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-[9px] top-3 w-px bg-gradient-to-b from-transparent via-border to-transparent"
      />
      {data.map((item, index) => (
        <motion.li
          key={item.id}
          initial={reduceMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: item.pending ? 0.55 : 1, x: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.2),
          }}
          className="relative flex gap-3 pb-3.5 last:pb-0"
        >
          <span
            className="relative z-10 mt-3 size-[19px] shrink-0 rounded-full border-2 bg-background"
            style={{ borderColor: item.markerColor }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-[3px] rounded-full"
              style={{ background: item.markerColor }}
            />
          </span>
          <div className="min-w-0 flex-1">{item.content}</div>
        </motion.li>
      ))}
    </ol>
  );
}
