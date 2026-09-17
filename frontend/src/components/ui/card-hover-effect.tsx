import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface HoverActionItem {
  title: string;
  description: string;
  to: string;
  icon: ReactNode;
}

export function HoverEffect({
  items,
  className,
}: {
  items: HoverActionItem[];
  className?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item, index) => (
        <Link
          to={item.to}
          key={item.to}
          className="group relative block h-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onFocus={() => setHoveredIndex(index)}
          onBlur={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === index && (
              <motion.span
                layoutId="dashboard-hover-action"
                className="absolute inset-0 rounded-2xl border border-primary/20 bg-primary/10"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
              />
            )}
          </AnimatePresence>
          <div className="relative z-10 h-full rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {item.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
