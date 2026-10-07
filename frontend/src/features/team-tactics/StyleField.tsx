/**
 * A style dropdown (Defensive style / Build-up style) with the live-updating
 * trade-off caption shown directly beneath it.
 *
 * On the Tactics tab the caption is suppressed, because the preview panel beside
 * the controls already shows it next to the mini pitch; elsewhere (the PDF-facing
 * and read-only views) it stays inline.
 */

import { useId, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StyleOption } from "./tactics-options";

interface StyleFieldProps<T extends string> {
  label: string;
  value: T;
  options: StyleOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Hide the inline trade-off caption when something else is showing it. */
  hideDescription?: boolean;
}

export function StyleField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hideDescription = false,
}: StyleFieldProps<T>) {
  const id = useId();

  const items = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of options) map[option.value] = option.label;
    return map;
  }, [options]);

  const description =
    options.find((o) => o.value === value)?.description ?? "";

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-muted-foreground"
      >
        {label}
      </label>

      <Select
        items={items}
        value={value}
        onValueChange={(val) => {
          if (val) onChange(val as T);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          className="h-11 w-full text-base font-semibold"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideDescription && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
