import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface AnimatedTooltipProps {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "right";
  portal?: boolean;
  dismissOnEscape?: boolean;
  screenReaderDescription?: string;
  enabled?: boolean;
}

/** Opt-in navigation tooltip; the original renderer below remains unchanged. */
function PortalTooltip({ label, description, children, className, dismissOnEscape,
  screenReaderDescription, enabled = true }: AnimatedTooltipProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const descriptionId = useId();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open || !enabled) return;
    let frame: number;
    // Track the existing sidebar width animation as well as viewport changes.
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) {
        const sidebar = anchor.current?.closest("aside")?.getBoundingClientRect();
        const left = (sidebar?.right ?? rect.right) + 8;
        const top = rect.top + rect.height / 2;
        setPosition((previous) => previous?.left === left && previous.top === top
          ? previous : { left, top });
      }
      frame = requestAnimationFrame(update);
    };
    update();
    const onKeyDown = (event: KeyboardEvent) => {
      if (dismissOnEscape && event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, enabled, dismissOnEscape]);

  const trigger = children as ReactElement<{ "aria-describedby"?: string }>;
  return (
    <div ref={anchor} className={cn("relative", className)}
      onMouseEnter={() => { if (enabled) setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => { if (enabled) setOpen(true); }}
      onBlurCapture={() => setOpen(false)}>
      {screenReaderDescription ? cloneElement(trigger, {
        "aria-describedby": [trigger.props["aria-describedby"], descriptionId].filter(Boolean).join(" "),
      }) : children}
      {screenReaderDescription && <span id={descriptionId} className="sr-only">{screenReaderDescription}</span>}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && enabled && position && <motion.div
            id={tooltipId} role="tooltip"
            initial={reduceMotion ? false : { opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            style={{ left: position.left, top: position.top }}
            className="pointer-events-none fixed z-50 hidden w-max max-w-52 -translate-y-1/2 rounded-lg border border-sidebar-border bg-popover/96 px-3 py-2 text-popover-foreground shadow-xl backdrop-blur-xl lg:block">
            <p className="text-xs font-semibold">{label}</p>
            {description && <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>}
          </motion.div>}
        </AnimatePresence>, document.body)}
    </div>
  );
}

/** Hover, focus, and touch-friendly adaptation of Aceternity's tooltip. */
export function AnimatedTooltip(props: AnimatedTooltipProps) {
  if (props.portal && props.side === "right") return <PortalTooltip {...props} />;
  return <OriginalAnimatedTooltip {...props} />;
}

function OriginalAnimatedTooltip({
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
            className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-max max-w-52 -translate-x-1/2 rounded-lg border border-border-default bg-popover/96 px-3 py-2 text-center text-popover-foreground shadow-xl backdrop-blur-xl"
          >
            <p className="text-xs font-semibold text-popover-foreground">{label}</p>
            {description && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
            )}
            <span className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border-default bg-popover" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
