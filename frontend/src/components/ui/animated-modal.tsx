import type { ComponentProps } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AnimatedModalContentProps = ComponentProps<typeof DialogContent>;

/** Keeps the accessible Base UI dialog while adding Aceternity-style depth. */
export function AnimatedModalContent({
  className,
  children,
  ...props
}: AnimatedModalContentProps) {
  const reduceMotion = useReducedMotion();

  return (
    <DialogContent
      className={cn(
        "overflow-hidden border-border/70 bg-card/95 shadow-[0_30px_100px_-35px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
        className,
      )}
      {...props}
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 280, damping: 24 }
        }
        className="contents"
      >
        {children}
      </motion.div>
    </DialogContent>
  );
}
