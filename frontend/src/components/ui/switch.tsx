import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

/**
 * A two-state toggle for settings that take effect immediately — on/off, with
 * no confirmation step. Use a Button with `aria-pressed` instead when the
 * control is a mode the user steps in and out of.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 shadow-inner transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:bg-primary data-unchecked:bg-input",
        className,
      )}
      {...props}
    />
  );
}

function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "block size-4 rounded-full bg-white shadow-xs transition-transform",
        "data-checked:translate-x-4 data-unchecked:translate-x-0",
        className,
      )}
      {...props}
    />
  );
}

export { Switch, SwitchThumb };
