import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  HeartPulse,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { GafferAiAssistant } from "@/features/ai-assistant/GafferAiAssistant";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/tabs";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { getAthletes } from "@/services/athletes";
import { cn } from "@/lib/utils";
import { fetchInjuries, fetchInjury } from "./api";
import { BodyModelViewer } from "./BodyModelViewer";
import { CloseInjuryDialog } from "./CloseInjuryDialog";
import { InjuryDetailCard } from "./InjuryDetailCard";
import { InjuryHistoryTab } from "./InjuryHistoryTab";
import { InjuryTimeline } from "./InjuryTimeline";
import { LogInjuryDialog } from "./LogInjuryDialog";
import { MuscleRecoveryStrip } from "./MuscleRecoveryStrip";
import { injuryTitle } from "./body-regions";
import { downloadInjuryReportPdf, type InjuryReportEntry } from "./exportInjuryReportPdf";
import {
  useCloseInjury,
  useCreateInjury,
  useInjuries,
  useInjury,
  useInjuryRecovery,
} from "./hooks";
import {
  INJURY_STATUS_LABELS,
  athleteName,
  injurySummary,
  sortForAttention,
  todayIso,
} from "./injury-model";
import type {
  BodyRegion,
  CloseInjuryInput,
  CreateInjuryInput,
  InjuryDetail,
  InjuryListItem,
  RecoveryReading,
} from "./types";
import "./injuries-background.css";

type TabValue = "overview" | "history";

const TABS = [
  { value: "overview" as const, label: "Overview" },
  { value: "history" as const, label: "Injury history" },
];

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "good";
}) {
  return (
    <AppCard className="flex min-h-[100px] min-w-0 flex-col p-3 sm:block sm:min-h-0 sm:p-4">
      <p className="text-[11px] leading-tight uppercase tracking-wide text-muted-foreground sm:leading-normal">
        {label}
      </p>
      <p
        className={cn(
          "mt-auto pt-2 font-display text-2xl font-semibold sm:mt-1 sm:pt-0",
          tone === "warning" && "text-red-400",
          tone === "good" && "text-emerald-400",
          (!tone || tone === "default") && "text-foreground",
        )}
      >
        {value}
      </p>
    </AppCard>
  );
}

function InjuryRecoveryRecords({
  isPending,
  isError,
  error,
  summary,
  injuries,
  tab,
  onSelect,
  onLog,
  playerOptions,
  playerItems,
  focused,
  switchPlayer,
  athleteInjuries,
  injuredRegions,
  selectedRegion,
  injuryCallouts,
  onRegionSelect,
  detail,
  today,
  recoveryReadings,
  isDownloadingReport,
  reportError,
  onDownloadReport,
  onCloseInjury,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  summary: ReturnType<typeof injurySummary>;
  injuries: InjuryListItem[];
  tab: TabValue;
  onSelect: (injury: InjuryListItem) => void;
  onLog: () => void;
  playerOptions: { id: string; label: string }[];
  playerItems: Record<string, string>;
  focused?: InjuryListItem;
  switchPlayer: (athleteId: string) => void;
  athleteInjuries: InjuryListItem[];
  injuredRegions: BodyRegion[];
  selectedRegion: BodyRegion | null;
  injuryCallouts: Partial<Record<BodyRegion, { title: string; subtitle: string }>>;
  onRegionSelect: (region: BodyRegion) => void;
  detail?: InjuryDetail;
  today: string;
  recoveryReadings?: RecoveryReading[];
  isDownloadingReport: boolean;
  reportError?: string;
  onDownloadReport: () => void;
  onCloseInjury: () => void;
}) {
  if (isPending) {
    return <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
        Loading injury records&hellip;
      </span>
    </div>;
  }
  if (isError) {
    return <AppCard><p role="alert" className="text-sm text-destructive">
      {error instanceof ApiError ? error.message : "Could not load injury records."}
    </p></AppCard>;
  }
  return <InjuryRecoverySections
    summary={summary}
    injuries={injuries}
    tab={tab}
    onSelect={onSelect}
    onLog={onLog}
    playerOptions={playerOptions}
    playerItems={playerItems}
    focused={focused}
    switchPlayer={switchPlayer}
    athleteInjuries={athleteInjuries}
    injuredRegions={injuredRegions}
    selectedRegion={selectedRegion}
    injuryCallouts={injuryCallouts}
    onRegionSelect={onRegionSelect}
    detail={detail}
    today={today}
    recoveryReadings={recoveryReadings}
    isDownloadingReport={isDownloadingReport}
    reportError={reportError}
    onDownloadReport={onDownloadReport}
    onCloseInjury={onCloseInjury}
  />;
}

type InjuryRecoverySectionsProps = Omit<Parameters<typeof InjuryRecoveryRecords>[0], "isPending" | "isError" | "error">;

function InjuryRecoverySections(props: InjuryRecoverySectionsProps) {
  return <div className="mx-auto w-full max-w-[1600px] space-y-5 px-6 pb-10 sm:px-8 lg:px-10">
    <InjurySummaryTiles summary={props.summary} />
    {props.tab === "history" ? (
      <InjuryHistoryTab injuries={props.injuries} onSelect={props.onSelect} />
    ) : props.injuries.length === 0 ? (
      <NoInjuriesCard onLog={props.onLog} />
    ) : (
      <InjuryRecoveryOverview {...props} />
    )}
  </div>;
}

function InjurySummaryTiles({ summary }: { summary: ReturnType<typeof injurySummary> }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <SummaryTile label="Currently injured" value={summary.openCount} tone={summary.openCount > 0 ? "warning" : "good"} />
    <SummaryTile label="Due back within a week" value={summary.dueBackWithinAWeek} />
    <SummaryTile label="Recurrences" value={summary.recurrenceCount} tone={summary.recurrenceCount > 0 ? "warning" : "default"} />
    <SummaryTile label="Days lost on record" value={summary.daysLostThisSeason} />
  </div>;
}

function NoInjuriesCard({ onLog }: { onLog: () => void }) {
  return <AppCard className="flex flex-col items-center gap-3 py-14 text-center">
    <span className="flex size-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400" aria-hidden="true">
      <ShieldCheck className="size-6" />
    </span>
    <div>
      <p className="font-display text-lg font-semibold text-foreground">No injuries on record</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Injuries logged in the live logger appear here automatically, or add one manually.
      </p>
    </div>
    <Button variant="outline" onClick={onLog}><Plus className="size-4" aria-hidden="true" />Log injury</Button>
  </AppCard>;
}

function InjuryRecoveryOverview({
  playerOptions,
  playerItems,
  focused,
  switchPlayer,
  athleteInjuries,
  injuredRegions,
  selectedRegion,
  injuryCallouts,
  onRegionSelect,
  onSelect,
  detail,
  today,
  recoveryReadings,
  isDownloadingReport,
  reportError,
  onDownloadReport,
  onCloseInjury,
}: InjuryRecoverySectionsProps) {
  return <>
    {playerOptions.length > 1 && <InjuryPlayerSelect
      items={playerItems}
      options={playerOptions}
      value={focused?.athleteId ?? null}
      onChange={switchPlayer}
    />}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AthleteInjuryModelPanel
        focused={focused}
        athleteInjuries={athleteInjuries}
        injuredRegions={injuredRegions}
        selectedRegion={selectedRegion}
        injuryCallouts={injuryCallouts}
        onRegionSelect={onRegionSelect}
        onSelect={onSelect}
        isDownloadingReport={isDownloadingReport}
        reportError={reportError}
        onDownloadReport={onDownloadReport}
      />
      <div className="space-y-5">
        <FocusedInjuryDetails focused={focused} detail={detail} today={today} onCloseInjury={onCloseInjury} />
        {recoveryReadings && <MuscleRecoveryStrip readings={recoveryReadings} />}
      </div>
    </div>
  </>;
}

function InjuryPlayerSelect({
  items,
  options,
  value,
  onChange,
}: {
  items: Record<string, string>;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (athleteId: string) => void;
}) {
  return <div className="flex items-center gap-2">
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</span>
    <Select items={items} value={value} onValueChange={(next) => { if (next) onChange(next); }}>
      <SelectTrigger aria-label="Switch player" className="h-8 w-56 justify-between rounded-lg border-border/70 bg-card/70 px-2.5 text-sm text-foreground">
        <SelectValue placeholder="Select a player…" />
      </SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

function AthleteInjuryModelPanel({
  focused,
  athleteInjuries,
  injuredRegions,
  selectedRegion,
  injuryCallouts,
  onRegionSelect,
  onSelect,
  isDownloadingReport,
  reportError,
  onDownloadReport,
}: Pick<InjuryRecoverySectionsProps, "focused" | "athleteInjuries" | "injuredRegions" | "selectedRegion" | "injuryCallouts" | "onRegionSelect" | "onSelect" | "isDownloadingReport" | "reportError" | "onDownloadReport">) {
  return <AppCard className="self-start">
    {focused && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <HeartPulse className="size-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{athleteName(focused)}</p>
      </div>
      <div className="flex items-center gap-2">
        {athleteInjuries.length > 1 && <p className="text-[11px] text-muted-foreground">{athleteInjuries.length} open injuries</p>}
        <Button variant="outline" size="sm" onClick={onDownloadReport} disabled={isDownloadingReport} className="gap-1.5">
          <Download className="size-3.5" aria-hidden="true" />Download report
        </Button>
      </div>
    </div>}
    {reportError && <p role="alert" className="mb-3 text-xs text-destructive">{reportError}</p>}
    <BodyModelViewer injuredRegions={injuredRegions} selectedRegion={selectedRegion} injuryCallouts={injuryCallouts} onSelectRegion={onRegionSelect} />
    {athleteInjuries.length > 1 && <ul className="mt-3 flex flex-wrap gap-1.5">
      {athleteInjuries.map((injury) => <li key={injury.id}>
        <button
          type="button"
          onClick={() => onSelect(injury)}
          aria-pressed={injury.id === focused?.id}
          className={cn(
            "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
            injury.id === focused?.id
              ? "border-primary/50 bg-primary/15 text-foreground"
              : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >{injuryTitle(injury)}</button>
      </li>)}
    </ul>}
  </AppCard>;
}

function FocusedInjuryDetails({
  focused,
  detail,
  today,
  onCloseInjury,
}: {
  focused?: InjuryListItem;
  detail?: InjuryDetail;
  today: string;
  onCloseInjury: () => void;
}) {
  if (detail) return <>
    <InjuryDetailCard injury={detail} today={today} onMarkReturned={onCloseInjury} />
    <InjuryTimeline entries={detail.timeline} today={today} isOpen={detail.isOpen} />
  </>;
  if (!focused) return null;
  return <InjuryDetailCard injury={focused} today={today} onMarkReturned={onCloseInjury} />;
}

/**
 * Injury & Recovery — the team's injury record, and the recovery picture for
 * one athlete at a time.
 *
 * The Overview tab centres on a single injury: the 3D model shows where it
 * is, the detail card what it is and when the athlete is due back, and the
 * timeline how the recovery has actually gone. The history tab is the
 * auditable record across the squad.
 *
 * A `?injury=` parameter deep-links straight to one record, which is how the
 * live logger hands off after an injury is logged mid-match.
 */
export default function InjuryRecoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabValue>("overview");
  const [isLogOpen, setLogOpen] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();
  const [isCloseOpen, setCloseOpen] = useState(false);
  const [closeError, setCloseError] = useState<string | undefined>();
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion | null>(null);
  const [isDownloadingReport, setDownloadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | undefined>();

  const { team } = useAuth();
  const queryClient = useQueryClient();
  const today = todayIso();
  const injuriesQuery = useInjuries();
  const createInjury = useCreateInjury();
  const closeInjury = useCloseInjury();

  const athletesQuery = useQuery({
    queryKey: ["athletes", "active"],
    queryFn: getAthletes,
  });

  const injuries = useMemo(
    () => sortForAttention(injuriesQuery.data ?? []),
    [injuriesQuery.data],
  );

  /* The focused record: the deep-linked one when the URL names it, else the
   * injury most in need of attention. */
  const urlInjuryId = searchParams.get("injury");
  const focused: InjuryListItem | undefined = useMemo(() => {
    if (urlInjuryId) {
      const match = injuries.find((injury) => injury.id === urlInjuryId);
      if (match) {
        return match;
      }
    }

    return injuries[0];
  }, [injuries, urlInjuryId]);

  const detailQuery = useInjury(focused?.id);
  const detail = detailQuery.data;
  const recoveryQuery = useInjuryRecovery(focused?.athleteId);

  /* Every open injury on the focused athlete lights up the model, not just
   * the focused one — a coach looking at a player needs to see everything
   * currently wrong with them. */
  const athleteInjuries = useMemo(
    () =>
      focused
        ? injuries.filter(
            (injury) => injury.athleteId === focused.athleteId && injury.isOpen,
          )
        : [],
    [injuries, focused],
  );

  const injuredRegions = useMemo(
    () => athleteInjuries.map((injury) => injury.bodyRegion),
    [athleteInjuries],
  );

  /* One callout per injured region, so hovering any of them on the model
   * (not just the focused one) shows its own title/status. */
  const injuryCallouts = useMemo(
    () =>
      Object.fromEntries(
        athleteInjuries.map((injury) => [
          injury.bodyRegion,
          {
            title: injuryTitle(injury),
            subtitle: INJURY_STATUS_LABELS[injury.status],
          },
        ]),
      ) as Partial<Record<BodyRegion, { title: string; subtitle: string }>>,
    [athleteInjuries],
  );

  /* Follow the focused record unless the coach has clicked another region on
   * the model. */
  useEffect(() => {
    setSelectedRegion(focused?.bodyRegion ?? null);
  }, [focused?.id, focused?.bodyRegion]);

  const selectInjury = (injury: InjuryListItem) => {
    const next = new URLSearchParams(searchParams);
    next.set("injury", injury.id);
    setSearchParams(next, { replace: true });
    setTab("overview");
  };

  /**
   * One entry per athlete with a currently *open* injury, alphabetised.
   *
   * A player who has fully returned has nothing for the 3D model to mark —
   * it only ever highlights open injuries — so offering them here would
   * land the coach on a blank-looking model with no obvious explanation.
   * They're still reachable (History tab, or the deep-linked URL); this
   * switcher just never puts you there itself.
   */
  const playerOptions = useMemo(() => {
    const byAthlete = new Map<string, { id: string; label: string }>();
    for (const injury of injuries) {
      if (!injury.isOpen || byAthlete.has(injury.athleteId)) {
        continue;
      }
      const name = athleteName(injury);
      byAthlete.set(injury.athleteId, {
        id: injury.athleteId,
        label:
          injury.athleteSquadNumber != null
            ? `#${injury.athleteSquadNumber} ${name}`
            : name,
      });
    }
    return Array.from(byAthlete.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [injuries]);

  const playerItems = useMemo(
    () => Object.fromEntries(playerOptions.map((option) => [option.id, option.label])),
    [playerOptions],
  );

  /** Jumps to that athlete's most-relevant *open* record, matching the same
   * attention ordering (worst severity, most recent) the rest of the page
   * already sorts `injuries` by. */
  const switchPlayer = (athleteId: string) => {
    const match = injuries.find(
      (injury) => injury.athleteId === athleteId && injury.isOpen,
    );
    if (match) {
      selectInjury(match);
    }
  };

  /** Clicking a region on the model jumps to that region's open injury. */
  const handleRegionSelect = (region: BodyRegion) => {
    setSelectedRegion(region);
    const match = athleteInjuries.find(
      (injury) => injury.bodyRegion === region,
    );
    if (match && match.id !== focused?.id) {
      selectInjury(match);
    }
  };

  /**
   * The report covers this athlete's whole record, not just the focused
   * injury, so it re-fetches every one of their injuries (list endpoint
   * doesn't include timelines) and then each one's full detail in parallel.
   */
  const handleDownloadReport = async () => {
    if (!focused || isDownloadingReport) {
      return;
    }
    setDownloadingReport(true);
    setReportError(undefined);
    try {
      const list = await fetchInjuries({
        athleteId: focused.athleteId,
        status: "all",
      });
      const details = await Promise.all(
        list.map((item) => fetchInjury(item.id)),
      );
      const recurrenceById = new Map(
        list.map((item) => [item.id, item.isRecurrence]),
      );
      const entries: InjuryReportEntry[] = details.map((detail) => ({
        ...detail,
        isRecurrence: recurrenceById.get(detail.id) ?? false,
      }));

      downloadInjuryReportPdf({
        athlete: {
          firstName: focused.athleteFirstName,
          lastName: focused.athleteLastName,
          squadNumber: focused.athleteSquadNumber,
          position: focused.athletePosition,
        },
        teamName: team?.name ?? null,
        injuries: entries,
        today,
      });
    } catch (error) {
      setReportError(
        error instanceof ApiError
          ? error.message
          : "Could not generate the injury report. Please try again.",
      );
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleLogSubmit = (input: CreateInjuryInput) => {
    setLogError(undefined);
    createInjury.mutate(input, {
      onSuccess: (created) => {
        setLogOpen(false);
        const next = new URLSearchParams(searchParams);
        next.set("injury", created.id);
        setSearchParams(next, { replace: true });
        setTab("overview");
      },
      onError: (error) => {
        setLogError(
          error instanceof ApiError
            ? error.message
            : "Could not save this injury. Please try again.",
        );
      },
    });
  };

  const handleCloseSubmit = (input: CloseInjuryInput) => {
    if (!focused) {
      return;
    }
    setCloseError(undefined);
    closeInjury.mutate(
      { injuryId: focused.id, input },
      {
        onSuccess: () => {
          setCloseOpen(false);
        },
        onError: (error) => {
          setCloseError(
            error instanceof ApiError
              ? error.message
              : "Could not mark this injury as returned. Please try again.",
          );
        },
      },
    );
  };

  const summary = useMemo(
    () => injurySummary(injuries, today),
    [injuries, today],
  );

  const athleteOptions = useMemo(
    () =>
      (athletesQuery.data ?? []).map((athlete) => ({
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        squadNumber: athlete.squadNumber,
      })),
    [athletesQuery.data],
  );

  return (
    <div className="injuries-page relative isolate min-h-full">
      <div className="injuries-page-backdrop" aria-hidden="true" />

      <div className="relative z-10">
      <MultiStepLoader
        loading={isDownloadingReport}
        loadingStates={[
          { text: "Gathering injury history" },
          { text: "Building timeline" },
          { text: "Generating PDF" },
        ]}
        duration={180}
      />
      <PageHeader
        title="Injury & Recovery"
        subtitle="Track injuries, monitor recovery and get players back on the pitch."
        headingClassName="min-w-0 w-fit max-w-full rounded-xl bg-white/60 px-4 py-3 sm:px-5 dark:min-w-auto dark:w-auto dark:max-w-none dark:rounded-none dark:bg-transparent dark:p-0"
        subtitleClassName="text-black dark:text-muted-foreground"
        actions={
          <Button onClick={() => setLogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Log injury
          </Button>
        }
      >
        <AnimatedTabs
          items={TABS}
          value={tab}
          onValueChange={setTab}
          ariaLabel="Injury and recovery sections"
        />
      </PageHeader>

      <InjuryRecoveryRecords
        isPending={injuriesQuery.isPending}
        isError={injuriesQuery.isError}
        error={injuriesQuery.error}
        summary={summary}
        injuries={injuries}
        tab={tab}
        onSelect={selectInjury}
        onLog={() => setLogOpen(true)}
        playerOptions={playerOptions}
        playerItems={playerItems}
        focused={focused}
        switchPlayer={switchPlayer}
        athleteInjuries={athleteInjuries}
        injuredRegions={injuredRegions}
        selectedRegion={selectedRegion}
        injuryCallouts={injuryCallouts}
        onRegionSelect={handleRegionSelect}
        detail={detail}
        today={today}
        recoveryReadings={recoveryQuery.data}
        isDownloadingReport={isDownloadingReport}
        reportError={reportError}
        onDownloadReport={handleDownloadReport}
        onCloseInjury={() => setCloseOpen(true)}
      />

      <LogInjuryDialog
        isOpen={isLogOpen}
        onClose={() => {
          setLogOpen(false);
          setLogError(undefined);
        }}
        athletes={athleteOptions}
        onSubmit={handleLogSubmit}
        isSubmitting={createInjury.isPending}
        errorMessage={logError}
      />

      {focused && (
        <CloseInjuryDialog
          isOpen={isCloseOpen}
          onClose={() => {
            setCloseOpen(false);
            setCloseError(undefined);
          }}
          injuryTitle={injuryTitle(focused)}
          occurredOn={focused.occurredOn}
          onSubmit={handleCloseSubmit}
          isSubmitting={closeInjury.isPending}
          errorMessage={closeError}
        />
      )}

      <GafferAiAssistant
        context="injuries"
        // No `selectedPlayerId`: the assistant always resolves the player
        // from the conversation itself (by name, or by asking). `focused`
        // here is just a display default (the most-urgent existing injury,
        // or whatever `?injury=` last pointed at) — not a deliberate choice
        // by the coach for whatever they're about to ask or record next.
        onEntityCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["injuries"] });
          void queryClient.invalidateQueries({ queryKey: ["athletes"] });
        }}
      />
      </div>
    </div>
  );
}
