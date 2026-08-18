import { useState, useRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Props for the FloatingLabelInput component.
 *
 * Extends the native `<input>` attributes and adds a required `label` string
 * plus an optional `rightSlot` for inline controls (e.g. password-visibility
 * toggle).
 */
type FloatingLabelInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Label text displayed inside the input, floating to the border on focus. */
  label: string;
  /** Optional content rendered inside the input on the trailing (right) side. */
  rightSlot?: React.ReactNode;
};

/**
 * FloatingLabelInput — A modern floating/embedded-label text input.
 *
 * The label starts centered inside the field and transitions to the top-left
 * portion of the border when the field is focused or contains a value.  A
 * semi-transparent background on the label masks the border beneath it,
 * creating the visual "notch" effect.
 *
 * Supports a `rightSlot` for supplementary controls such as a password
 * visibility toggle.
 */
export function FloatingLabelInput({
  label,
  className,
  rightSlot,
  value,
  onChange,
  onFocus,
  onBlur,
  type = "text",
  id: externalId,
  ...rest
}: FloatingLabelInputProps) {
  const [localValue, setLocalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = externalId ?? generatedId;

  const displayValue = value !== undefined ? String(value) : localValue;
  const isActive = isFocused || displayValue.length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    onChange?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <div
      className="relative"
      onMouseDown={(e) => {
        /* Prevent focus theft so the explicit .focus() call below works. */
        if (e.target !== inputRef.current) {
          e.preventDefault();
        }
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* ── Floating label ──────────────────────────────────────────────── */}
      <label
        htmlFor={inputId}
        className={cn(
          "pointer-events-none absolute z-10 px-1.5 select-none transition-all duration-200 ease-out",
          isActive
            ? "left-4 -top-2.5 text-[11px] font-medium leading-none bg-card text-muted-foreground"
            : "left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
        )}
      >
        {label}
      </label>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <input
        ref={inputRef}
        id={inputId}
        type={type}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "w-full rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground",
          "outline-none transition-colors duration-200",
          "placeholder:text-transparent",
          "focus:border-brand focus:ring-1 focus:ring-brand/30",
          rightSlot ? "pr-11" : "",
          className,
        )}
        {...rest}
      />

      {/* ── Right slot (e.g. eye toggle) ────────────────────────────────── */}
      {rightSlot && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
