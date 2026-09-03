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
  FORMATIONS,
  FORMATION_OPTIONS,
} from "@/features/team-management/formations";

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
            {FORMATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
