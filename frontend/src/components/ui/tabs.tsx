import { useId, type ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AnimatedTabItem<T extends string = string> {
  label: string;
  value: T;
  icon?: ReactNode;
}

interface AnimatedTabsProps<T extends string> {
  items: AnimatedTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Controlled, URL-friendly adaptation of Aceternity's animated tabs. */
export function AnimatedTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: AnimatedTabsProps<T>) {
  const layoutId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
    >
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className={cn(
          "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/65 p-1 shadow-inner backdrop-blur-xl",
          className,
        )}
      >
        {items.map((item) => {
          const active = item.value === value;

          return (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              className="relative isolate inline-flex min-w-fit items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:text-foreground"
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 -z-10 rounded-lg border border-primary/25 bg-primary/12 shadow-[0_10px_30px_-18px_var(--primary)]"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", bounce: 0.18, duration: 0.45 }
                  }
                />
              )}
              {item.icon}
              <span>{item.label}</span>
            </TabsPrimitive.Trigger>
          );
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
