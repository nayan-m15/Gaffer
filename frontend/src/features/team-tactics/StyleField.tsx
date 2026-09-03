/**
 * A style dropdown (Defensive style / Offensive style) with the FIFA-style
 * live-updating trade-off caption shown directly beneath it.
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
}

export function StyleField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
