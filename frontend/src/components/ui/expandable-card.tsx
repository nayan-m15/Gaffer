import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableCardProps {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  buttonLabel: string;
  onOpen?: () => void;
}

/** Accessible inline adaptation of Aceternity's expandable-card demo. */
export function ExpandableCard({
  summary,
  children,
  className,
  buttonLabel,
  onOpen,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <article className={cn("rounded-xl border border-border/70 bg-card/75", className)}>
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={buttonLabel}
        onClick={() => {
          setExpanded((value) => !value);
          onOpen?.();
        }}
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={contentId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-3 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
