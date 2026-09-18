import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatefulButtonStatus = "idle" | "loading" | "success" | "error";

interface StatefulButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  status?: StatefulButtonStatus;
  loadingText?: ReactNode;
  successText?: ReactNode;
  errorText?: ReactNode;
}

/** Aceternity-style button whose animation follows the real async state. */
export function StatefulButton({
  status = "idle",
  loadingText = "Saving...",
  successText = "Saved",
  errorText = "Try again",
  className,
  children,
  disabled,
  ...props
}: StatefulButtonProps) {
  const reduceMotion = useReducedMotion();
  const content =
    status === "loading"
      ? { key: "loading", icon: <Loader2 className="size-3.5 animate-spin" />, text: loadingText }
      : status === "success"
        ? { key: "success", icon: <Check className="size-3.5" />, text: successText }
        : status === "error"
          ? { key: "error", icon: <TriangleAlert className="size-3.5" />, text: errorText }
          : { key: "idle", icon: null, text: children };

  return (
    <button
      className={cn(
        "inline-flex h-8 min-w-24 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs transition-[background-color,box-shadow,transform] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
        status === "success" && "bg-emerald-500 hover:bg-emerald-500",
        status === "error" && "bg-destructive hover:bg-destructive/90",
        className,
      )}
      disabled={disabled || status === "loading"}
      aria-busy={status === "loading"}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={content.key}
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="inline-flex items-center justify-center gap-1.5"
        >
          {content.icon}
          {content.text}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
