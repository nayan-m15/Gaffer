import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingState {
  text: string;
}

export function MultiStepLoader({
  loadingStates,
  loading,
  duration = 450,
}: {
  loadingStates: LoadingState[];
  loading: boolean;
  duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!loading) {
      setCurrent(0);
      return;
    }
    const timer = window.setInterval(() => {
      setCurrent((value) => Math.min(value + 1, loadingStates.length - 1));
    }, duration);
    return () => window.clearInterval(timer);
  }, [duration, loading, loadingStates.length]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-xl"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/95 p-6 shadow-2xl">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Preparing download
            </p>
            <div className="space-y-3">
              {loadingStates.map((state, index) => (
                <div
                  key={state.text}
                  className={cn(
                    "flex items-center gap-3 text-sm",
                    index > current ? "text-muted-foreground/45" : "text-foreground",
                  )}
                >
                  <span className="flex size-6 items-center justify-center rounded-full border border-border">
                    {index < current ? (
                      <Check className="size-3.5 text-primary" />
                    ) : index === current ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/35" />
                    )}
                  </span>
                  {state.text}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
