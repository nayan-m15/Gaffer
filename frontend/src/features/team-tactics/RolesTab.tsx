/**
 * The Roles tab — team-level set-piece and leadership assignments, one
 * athlete each (FIFA's "Player Roles" tab).
 */

import type { BackendAthlete } from "@/services/athletes";
import type { GamePlanTactics } from "@/services/gamePlans";
import { AthleteSelect } from "./AthleteSelect";

interface RolesTabProps {
  content: GamePlanTactics;
  athletes: BackendAthlete[];
  onChange: (patch: Partial<GamePlanTactics>) => void;
  disabled?: boolean;
}

export function RolesTab({
  content,
  athletes,
  onChange,
  disabled,
}: RolesTabProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Player roles
      </h2>
      <p className="mb-5 text-xs text-muted-foreground">
        Pick who wears the armband and who stands over each set piece for this
        game plan.
      </p>

      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <AthleteSelect
          label="Captain"
          value={content.captainId}
          athletes={athletes}
          onChange={(captainId) => onChange({ captainId })}
          disabled={disabled}
        />
        <AthleteSelect
          label="Penalty taker"
          value={content.penaltyTakerId}
          athletes={athletes}
          onChange={(penaltyTakerId) => onChange({ penaltyTakerId })}
          disabled={disabled}
        />
        <AthleteSelect
          label="Free kick taker"
          value={content.freeKickTakerId}
          athletes={athletes}
          onChange={(freeKickTakerId) => onChange({ freeKickTakerId })}
          disabled={disabled}
        />
        <AthleteSelect
          label="Corner taker"
          value={content.cornerTakerId}
          athletes={athletes}
          onChange={(cornerTakerId) => onChange({ cornerTakerId })}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
