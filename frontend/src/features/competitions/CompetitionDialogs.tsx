import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompetitionMutation } from "./hooks";
import { createCompetition, updateCompetition } from "./api";
import type { CompetitionDetail, CompetitionFormat, CompetitionInput, CompetitionType } from "./types";

export function RequestError({ error }: { error: Error | null }) {
  return error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null;
}

function Modal({ title, description, busy, onClose, children, className }: {
  title: string; description: string; busy: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy} className={`max-h-[92dvh] overflow-y-auto ${className ?? ""}`}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const fieldClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55";
const weekdayOptions = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
];
const knockoutSizes = [4, 8, 16, 32] as const;

type Step = 1 | 2 | 3;

function inferredFormat(competition?: CompetitionDetail): CompetitionFormat {
  if (competition?.format) return competition.format;
  return competition?.type === "cup" ? "knockout" : "league";
}

function initialTeamCount(competition?: CompetitionDetail) {
  if (competition?.configuredTeamCount) return competition.configuredTeamCount;
  if (competition?.participants.length) return Math.max(competition.participants.length, 2);
  return 8;
}

function NumberField({ label, value, min, max = 99, disabled, onChange }: {
  label: string; value: number; min: number; max?: number; disabled?: boolean; onChange: (value: number) => void;
}) {
  return <label className="grid gap-2 text-sm">{label}<input className={fieldClass} type="number" min={min} max={max} step={1} disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function CompetitionFormDialog({ competition, locked = false, onClose, onSaved }: {
  competition?: CompetitionDetail; locked?: boolean; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(competition?.name ?? "");
  const [type, setType] = useState<CompetitionType>(competition?.type === "cup" ? "cup" : "league");
  const [format, setFormat] = useState<CompetitionFormat>(inferredFormat(competition));
  const [season, setSeason] = useState(competition?.season ?? "");
  const [configuredTeamCount, setConfiguredTeamCount] = useState(initialTeamCount(competition));
  const [maxSubstitutes, setMaxSubstitutes] = useState(competition?.maxSubstitutes ?? 5);
  const [redCardSuspensionMatches, setRedCardSuspensionMatches] = useState(competition?.redCardSuspensionMatches ?? 1);
  const [accumulatedYellowThreshold, setAccumulatedYellowThreshold] = useState(competition?.accumulatedYellowThreshold ?? 5);
  const [yellowSuspensionMatches, setYellowSuspensionMatches] = useState(competition?.yellowSuspensionMatches ?? 1);
  const [fixturesPerOpponent, setFixturesPerOpponent] = useState<1 | 2>(competition?.fixturesPerOpponent ?? 1);
  const [pointsWin, setPointsWin] = useState(competition?.pointsWin ?? 3);
  const [pointsDraw, setPointsDraw] = useState(competition?.pointsDraw ?? 1);
  const [pointsLoss, setPointsLoss] = useState(competition?.pointsLoss ?? 0);
  const [qualifierCount, setQualifierCount] = useState<4 | 8 | 16 | 32>(
    knockoutSizes.includes((competition?.qualifierCount ?? 4) as 4 | 8 | 16 | 32)
      ? (competition?.qualifierCount ?? 4) as 4 | 8 | 16 | 32
      : 4,
  );
  const [startDate, setStartDate] = useState(competition?.startDate ?? new Date().toISOString().slice(0, 10));
  const [allowedPlayingDays, setAllowedPlayingDays] = useState<number[]>(competition?.allowedPlayingDays?.length ? competition.allowedPlayingDays : [6]);
  const [defaultKickoffTime, setDefaultKickoffTime] = useState(competition?.defaultKickoffTime ?? "15:00");

  const save = useCompetitionMutation((input: CompetitionInput | Pick<CompetitionInput, "name" | "season">) => competition
    ? updateCompetition(competition.id, input) : createCompetition(input as CompetitionInput));
  const isLeaguePhase = format === "league" || format === "league_knockout";
  const validQualifierOptions = knockoutSizes.filter((size) => size <= configuredTeamCount);
  const effectiveQualifier = validQualifierOptions.includes(qualifierCount) ? qualifierCount : validQualifierOptions[0] ?? 4;

  const basicValid = useMemo(() => {
    if (!name.trim() || !Number.isInteger(configuredTeamCount) || configuredTeamCount < 2 || configuredTeamCount > 128) return false;
    if (format === "knockout" && !knockoutSizes.includes(configuredTeamCount as 4 | 8 | 16 | 32)) return false;
    if (format === "league_knockout" && (!validQualifierOptions.length || effectiveQualifier > configuredTeamCount)) return false;
    return true;
  }, [configuredTeamCount, effectiveQualifier, format, name, validQualifierOptions.length]);

  const rulesValid = useMemo(() => {
    const boundedInteger = (value: number, min: number) => Number.isInteger(value) && value >= min && value <= 99;
    if (!boundedInteger(maxSubstitutes, 0) || !boundedInteger(redCardSuspensionMatches, 0) || !boundedInteger(accumulatedYellowThreshold, 1) || !boundedInteger(yellowSuspensionMatches, 0)) return false;
    if (!isLeaguePhase) return true;
    return boundedInteger(pointsWin, 0) && boundedInteger(pointsDraw, 0) && boundedInteger(pointsLoss, 0);
  }, [accumulatedYellowThreshold, isLeaguePhase, maxSubstitutes, pointsDraw, pointsLoss, pointsWin, redCardSuspensionMatches, yellowSuspensionMatches]);

  const scheduleValid = Boolean(
    startDate &&
    /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(defaultKickoffTime) &&
    allowedPlayingDays.length,
  );
  const formValid = basicValid && rulesValid && scheduleValid;
  const stepValid = step === 1 ? basicValid : step === 2 ? rulesValid : scheduleValid;
  const canOpenStep = (target: Step) => target === 1 || (target === 2 ? basicValid : basicValid && rulesValid);

  const chooseType = (nextType: CompetitionType) => {
    setType(nextType);
    if (nextType === "league") {
      setFormat("league");
    } else if (format === "league") {
      setFormat("knockout");
      if (!knockoutSizes.includes(configuredTeamCount as 4 | 8 | 16 | 32)) {
        setConfiguredTeamCount(8);
      }
    }
  };

  const submit = () => {
    if (competition && locked ? !name.trim() : !formValid) return;
    const fullInput: CompetitionInput = {
      name: name.trim(),
      type,
      season: season.trim(),
      format,
      configuredTeamCount,
      maxSubstitutes,
      redCardSuspensionMatches,
      accumulatedYellowThreshold,
      yellowSuspensionMatches,
      startDate,
      allowedPlayingDays: [...allowedPlayingDays].sort((a, b) => a - b),
      defaultKickoffTime,
      fixturesPerOpponent,
      pointsWin,
      pointsDraw,
      pointsLoss,
      qualifierCount: format === "league_knockout" ? effectiveQualifier : null,
    };
    const input = competition && locked ? { name: fullInput.name, season: fullInput.season } : fullInput;
    save.mutate(input, { onSuccess: (result) => onSaved(result.id) });
  };

  return (
    <Modal
      title={competition ? "Competition settings" : "Create competition"}
      description={competition ? "Review the competition setup and edit settings that are still safe to change." : "Set up the format, rules and schedule in three short steps. Your team is added automatically."}
      busy={save.isPending}
      onClose={onClose}
      className="sm:max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2" aria-label="Competition setup progress">
          {[
            { value: 1, label: "Basic details", icon: Trophy },
            { value: 2, label: "Rules", icon: ShieldCheck },
            { value: 3, label: "Schedule", icon: CalendarDays },
          ].map((item) => {
            const Icon = item.icon;
            const active = step === item.value;
            const target = item.value as Step;
            return <button key={item.value} type="button" disabled={save.isPending || (locked && item.value > 1) || (!locked && !canOpenStep(target))} onClick={() => setStep(target)} className={`rounded-xl border px-3 py-3 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}>
              <span className="flex items-center gap-2 font-medium"><Icon className="size-4" />Step {item.value}</span>
              <span className="mt-1 block hidden sm:block">{item.label}</span>
            </button>;
          })}
        </div>

        {locked && competition && <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-foreground">Fixtures or results already exist, so format, rules and schedule are locked. The competition name and season label can still be changed safely.</p>}

        <fieldset disabled={save.isPending} className="space-y-4">
          {step === 1 && <>
            <label className="grid gap-2 text-sm">Competition name<input className={fieldClass} autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="grid gap-2 text-sm">Season (optional)<input className={fieldClass} maxLength={20} placeholder="e.g. 2026/27" value={season} onChange={(event) => setSeason(event.target.value)} /></label>

            <div className="space-y-2"><p className="text-sm font-medium">Competition type</p><div className="grid gap-3 sm:grid-cols-2">
              {(["league", "cup"] as const).map((value) => <button key={value} type="button" disabled={locked} onClick={() => chooseType(value)} className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${type === value ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted/40"}`}><span className="font-semibold">{value === "league" ? "League" : "Cup"}</span><span className="mt-1 block text-sm text-muted-foreground">{value === "league" ? "Round-robin standings competition." : "Knockout, or league phase followed by knockout."}</span></button>)}
            </div></div>

            {type === "cup" && <div className="grid gap-2 text-sm"><label htmlFor="competition-format">Cup format</label><Select disabled={locked} value={format} onValueChange={(value) => { if (value === "knockout" || value === "league_knockout") { setFormat(value); if (value === "knockout" && !knockoutSizes.includes(configuredTeamCount as 4 | 8 | 16 | 32)) setConfiguredTeamCount(8); } }}><SelectTrigger id="competition-format" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="knockout">Knockout only</SelectItem><SelectItem value="league_knockout">League + Knockout</SelectItem></SelectContent></Select></div>}

            {format === "knockout" ? <div className="grid gap-2 text-sm"><label htmlFor="team-count">Number of teams</label><Select disabled={locked} value={String(configuredTeamCount)} onValueChange={(value) => setConfiguredTeamCount(Number(value))}><SelectTrigger id="team-count" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{knockoutSizes.map((size) => <SelectItem key={size} value={String(size)}>{size} teams</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Knockout-only cups currently use clean bracket sizes.</p></div> : <NumberField label="Number of teams" min={format === "league_knockout" ? 4 : 2} max={128} disabled={locked} value={configuredTeamCount} onChange={setConfiguredTeamCount} />}
          </>}

          {step === 2 && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Maximum substitutes allowed" min={0} disabled={locked} value={maxSubstitutes} onChange={setMaxSubstitutes} />
              <NumberField label="Red-card suspension (matches)" min={0} disabled={locked} value={redCardSuspensionMatches} onChange={setRedCardSuspensionMatches} />
              <NumberField label="Yellow cards before suspension" min={1} disabled={locked} value={accumulatedYellowThreshold} onChange={setAccumulatedYellowThreshold} />
              <NumberField label="Yellow-card suspension (matches)" min={0} disabled={locked} value={yellowSuspensionMatches} onChange={setYellowSuspensionMatches} />
            </div>
            {isLeaguePhase && <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-4">
              <h3 className="font-medium">League phase</h3>
              <div className="grid gap-2 text-sm"><label htmlFor="fixtures-per-opponent">Fixtures per opponent</label><Select disabled={locked} value={String(fixturesPerOpponent)} onValueChange={(value) => setFixturesPerOpponent(value === "2" ? 2 : 1)}><SelectTrigger id="fixtures-per-opponent" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Once</SelectItem><SelectItem value="2">Twice (home and away)</SelectItem></SelectContent></Select></div>
              <div className="grid gap-4 sm:grid-cols-3"><NumberField label="Points for win" min={0} disabled={locked} value={pointsWin} onChange={setPointsWin} /><NumberField label="Points for draw" min={0} disabled={locked} value={pointsDraw} onChange={setPointsDraw} /><NumberField label="Points for loss" min={0} disabled={locked} value={pointsLoss} onChange={setPointsLoss} /></div>
              <p className="text-xs text-muted-foreground">Tiebreak order: points, goal difference, goals scored.</p>
              {format === "league_knockout" && <div className="grid gap-2 text-sm"><label htmlFor="qualifier-count">Teams qualifying for knockout</label><Select disabled={locked || !validQualifierOptions.length} value={String(effectiveQualifier)} onValueChange={(value) => setQualifierCount(Number(value) as 4 | 8 | 16 | 32)}><SelectTrigger id="qualifier-count" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{validQualifierOptions.map((size) => <SelectItem key={size} value={String(size)}>Top {size}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">The highest-ranked teams are seeded automatically when the league phase is complete.</p></div>}
            </div>}
          </>}

          {step === 3 && <>
            <label className="grid gap-2 text-sm">Competition start date<input className={fieldClass} type="date" disabled={locked} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <div className="space-y-2"><p className="text-sm font-medium">Allowed playing days</p><div className="flex flex-wrap gap-2">{weekdayOptions.map((day) => { const selected = allowedPlayingDays.includes(day.value); return <button key={day.value} type="button" disabled={locked} aria-pressed={selected} className={`rounded-lg border px-3 py-2 text-sm ${selected ? "border-primary/45 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"}`} onClick={() => setAllowedPlayingDays((current) => selected ? current.filter((value) => value !== day.value) : [...current, day.value])}>{day.label}</button>; })}</div>{!allowedPlayingDays.length && <p className="text-sm text-destructive">Choose at least one playing day.</p>}</div>
            <label className="grid gap-2 text-sm">Default kickoff time (UTC)<input className={fieldClass} type="time" disabled={locked} value={defaultKickoffTime} onChange={(event) => setDefaultKickoffTime(event.target.value)} /></label>
            <p className="text-xs text-muted-foreground">The fixture generator moves each round to the next allowed playing day and uses this kickoff time.</p>
          </>}
        </fieldset>

        <RequestError error={save.error} />
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>{step > 1 && !locked && <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setStep((step - 1) as Step)}><ChevronLeft className="size-4" />Back</Button>}</div>
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>{step < 3 && !locked ? <Button type="button" disabled={!stepValid || save.isPending} onClick={() => setStep((step + 1) as Step)}>Next<ChevronRight className="size-4" /></Button> : <Button type="button" disabled={!stepValid || save.isPending} onClick={submit}>{save.isPending ? "Saving..." : competition ? "Save changes" : "Create competition"}</Button>}</div>
        </DialogFooter>
      </div>
    </Modal>
  );
}

export interface ActionDialogConfig {
  title: string;
  description: string;
  label?: string;
  inputType?: "text" | "email";
  initialValue?: string;
  confirm: string;
  destructive?: boolean;
  action: (value: string) => Promise<unknown>;
  onSuccess?: () => void;
}

export function CompetitionActionDialog({ config, onClose }: { config: ActionDialogConfig; onClose: () => void }) {
  const [value, setValue] = useState(config.initialValue ?? "");
  const mutation = useCompetitionMutation(config.action);
  return (
    <Modal title={config.title} description={config.description} busy={mutation.isPending} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(value.trim(), { onSuccess: () => { onClose(); config.onSuccess?.(); } });
      }}>
        {config.label && <label className="grid gap-2 text-sm">{config.label}<input className={fieldClass} autoFocus required
          type={config.inputType ?? "text"} maxLength={config.inputType === "email" ? 254 : 100}
          disabled={mutation.isPending} value={value} onChange={(e) => setValue(e.target.value)} /></label>}
        <RequestError error={mutation.error} />
        <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={config.destructive ? "destructive" : "default"}
            disabled={mutation.isPending || (!!config.label && !value.trim())}>{mutation.isPending ? "Working..." : config.confirm}</Button></DialogFooter>
      </form>
    </Modal>
  );
}
