/**
 * The Formation tab — picks the shape for this game plan and previews it on a
 * pitch. Player selection lives on the Team Management board; here we only
 * choose the formation the tactics are built around.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FootballPitch } from "@/features/team-management/FootballPitch";
import {
  FORMAT_OPTIONS,
  FORMATIONS,
  getDefaultFormationIdForPlayerCount,
  getFormationOptionsForPlayerCount,
  getFormationPlayerCount,
} from "@/features/team-management/formations";
import type { FormationPlayerCount } from "@/features/team-management/types";

interface FormationTabProps {
  formationId: string;
  onChange: (formationId: string) => void;
  disabled?: boolean;
}

export function FormationTab({
  formationId,
  onChange,
  disabled,
}: FormationTabProps) {
  const formation = FORMATIONS[formationId] ?? FORMATIONS["4-3-3"];
  const playerCount = getFormationPlayerCount(formation.id);
  const formationOptions = getFormationOptionsForPlayerCount(playerCount);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Formation
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The shape your defensive and offensive tactics are applied to.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(playerCount)}
            onValueChange={(val) => {
              const next = Number(val) as FormationPlayerCount;
              if (next === 5 || next === 7 || next === 11) {
                onChange(getDefaultFormationIdForPlayerCount(next));
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label="Select match format"
              className="h-10 min-w-32 font-semibold"
            >
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={formationId}
            onValueChange={(val) => {
              if (val) onChange(val);
            }}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label="Select formation"
              className="h-10 min-w-32 font-semibold"
            >
              <SelectValue placeholder="Select formation" />
            </SelectTrigger>
            <SelectContent>
              {formationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <FootballPitch>
        {formation.positions.map((pos) => (
          <div
            key={pos.id}
            className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-[10px] font-bold text-white shadow-md backdrop-blur-sm"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {pos.label}
          </div>
        ))}
      </FootballPitch>
    </section>
  );
}
