import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { Archive, ArchiveRestore, EyeOff, ArrowLeft, CalendarClock, Clock3, Pencil, Plus, Search, Settings2, Trash2, Trophy } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";

import { AppCard } from "@/components/app/AppCard";

import { GafferAiAssistant } from "@/features/ai-assistant/GafferAiAssistant";

import { StandingsDisplay } from "@/components/standings/StandingsDisplay";

import { Button } from "@/components/ui/button";

import { useAuth } from "@/hooks/useAuth";

import { useCompetition, useCompetitionFixtures, useCompetitionInvites, useCompetitionSearch, useMyCompetitions, useCompetitionMutation, useFixtureScheduleAlerts } from "./hooks";

import { addParticipant, setCompetitionHidden, setCompetitionArchived, deleteCompetition, deleteCompetitionResult, generateCompetitionFixtures, inviteCoach, removeParticipant, renameParticipant, resolveTeamVerification, revokeInvite } from "./api";

import { CompetitionActionDialog, CompetitionFormDialog, RequestError, type ActionDialogConfig } from "./CompetitionDialogs";

import { CompetitionResultDialog } from "./CompetitionResultDialog";

import { CompetitionFixturesView } from "./CompetitionFixturesView";

import { CompetitionPlayerStats } from "./CompetitionPlayerStats";

import { FixtureScheduleAlertsBanner } from "./FixtureScheduleAlertsBanner";

import type { CompetitionDetail, CompetitionFixture, CompetitionFixtureScheduleAlert, CompetitionFormat, CompetitionInvite, CompetitionResult, CompetitionSummary, Participant } from "./types";

import "./competitions-background.css";



const contentClass = "mx-auto w-full max-w-[1600px] space-y-6 px-6 pb-10 sm:px-8 lg:px-10";

const badgeClass = "rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyFixtures: CompetitionFixture[] = [];



function competitionBasePath(accountKind: "coach" | "player" | "new") {

  return accountKind === "player" ? "/player/competitions" : "/competitions";

}



function competitionFormat(competition: Pick<CompetitionDetail, "type" | "format">): CompetitionFormat {

  return competition.format ?? (competition.type === "cup" ? "knockout" : "league");

}



function formatLabel(type: CompetitionSummary["type"], format: CompetitionSummary["format"]) {

  if (type === "league") return "League";

  if (format === "league_knockout") return "Cup · League + Knockout";

  return "Cup · Knockout";

}



export default function CompetitionsPage() {

  const { id } = useParams();

  return (

    <div className="competitions-page relative isolate min-h-full">

      <div className="competitions-page-backdrop" aria-hidden="true" />

      <div className="relative z-10">

        {id ? <CompetitionDetails key={id} id={id} /> : <CompetitionWorkspace />}

      </div>

    </div>

  );

}



function CompetitionList({
  rows,
  empty,
  basePath,
  scheduleAlerts = [],
  onToggleHidden,
  busyId,
  showHidden = false,
}: {
  rows: CompetitionSummary[];
  empty: string;
  basePath: string;
  scheduleAlerts?: CompetitionFixtureScheduleAlert[];
  onToggleHidden?: (row: CompetitionSummary) => void;
  busyId?: string | null;
  showHidden?: boolean;
}) {
  if (!rows.length) return <p className="py-5 text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const competitionAlerts = scheduleAlerts.filter(
          (alert) => alert.competitionId === row.id && alert.state !== "confirmed",
        );
        const actionRequiredCount = competitionAlerts.filter(
          (alert) => alert.state === "action_required",
        ).length;
        const awaitingCount = competitionAlerts.filter(
          (alert) => alert.state === "awaiting_response",
        ).length;

        return (
          <div key={row.id} className="rounded-xl border border-border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
            <Link to={`${basePath}/${row.id}`} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-start justify-between gap-3">
                <h3 className="break-words font-semibold">{row.name}</h3>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {actionRequiredCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {actionRequiredCount === 1 ? "Reschedule" : `${actionRequiredCount} reschedules`}
                    </span>
                  )}
                  {actionRequiredCount === 0 && awaitingCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      Awaiting opponent
                    </span>
                  )}
                  {row.isAdmin && <span className={badgeClass}>Admin</span>}
                  {row.archivedAt && <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">Archived</span>}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatLabel(row.type, row.format)}{row.season ? ` · ${row.season}` : ""}
              </p>
              <p className="mt-3 text-sm">
                {row.participantCount}{row.configuredTeamCount ? ` / ${row.configuredTeamCount}` : ""} {row.participantCount === 1 ? "team" : "teams"}
              </p>
            </Link>
            {onToggleHidden && (
              <div className="mt-3 border-t border-border pt-3">
                <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => onToggleHidden(row)}>
                  {showHidden ? <ArchiveRestore className="size-4" /> : <EyeOff className="size-4" />}
                  {showHidden ? "Show in my feed" : "Hide from my feed"}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

}



function CompetitionWorkspace() {

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const { team, accountKind } = useAuth();

  const basePath = competitionBasePath(accountKind);

  const canCreate = team?.role === "coach";

  const mine = useMyCompetitions();

  const scheduleAlerts = useFixtureScheduleAlerts(canCreate);

  const activeScheduleAlerts = useMemo(

    () => (scheduleAlerts.data ?? []).filter((alert) => alert.state !== "confirmed"),

    [scheduleAlerts.data],

  );

  const [input, setInput] = useState("");

  const [term, setTerm] = useState("");

  const search = useCompetitionSearch(term);

  const [creating, setCreating] = useState(false);

  const [feedView, setFeedView] = useState<"active" | "archived" | "hidden">("active");

  const hide = useCompetitionMutation(({ id, hidden }: { id: string; hidden: boolean }) => setCompetitionHidden(id, hidden));

  const [hideError, setHideError] = useState("");

  const toggleHidden = (row: CompetitionSummary) => {

    setHideError("");

    hide.mutate({ id: row.id, hidden: !row.hiddenByMe }, { onError: (error) => setHideError(error.message) });

  };

  const feedRows = mine.data?.filter((row) => feedView === "hidden" ? row.hiddenByMe : !row.hiddenByMe && (feedView === "archived" ? Boolean(row.archivedAt) : !row.archivedAt)) ?? [];





  useEffect(() => {

    const nextTerm = input.trim();

    if (nextTerm.length < 2) { setTerm(""); return; }

    const timer = window.setTimeout(() => setTerm(nextTerm), 300);

    return () => window.clearTimeout(timer);

  }, [input]);



  return <>

    <PageHeader title="Leagues & Competitions" subtitle={canCreate ? "Find competitions, view standings or brackets, and manage the ones you administer." : "Find competitions and view their standings or knockout brackets."}

      actions={canCreate ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />Create competition</Button> : undefined} />

    <div className={contentClass}>

      {canCreate && <FixtureScheduleAlertsBanner showConfirmed={false} />}

      <AppCard className="space-y-5">

        <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5 text-primary" />My Leagues & Competitions</h2>

        {mine.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your competitions...</p>}

        <RequestError error={mine.error} />

        {mine.isError && <Button variant="outline" onClick={() => void mine.refetch()}>Retry</Button>}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Competition feed filter">
          {([["active", "Active"], ["archived", "Archived"], ["hidden", "Hidden by me"]] as const).map(([key, label]) => (
            <Button key={key} size="sm" variant={feedView === key ? "default" : "outline"} onClick={() => setFeedView(key)}>{label}</Button>
          ))}
        </div>
        {hideError && <p role="alert" className="text-sm text-destructive">{hideError}</p>}
        {mine.data && (
          <CompetitionList
            rows={feedRows}
            basePath={basePath}
            onToggleHidden={toggleHidden}
            busyId={hide.isPending ? hide.variables?.id : null}
            showHidden={feedView === "hidden"}
            empty={feedView === "hidden" ? "You have not hidden any competitions." : feedView === "archived" ? "No archived competitions." : "No active competitions. Check Archived or Hidden by me."}
            scheduleAlerts={activeScheduleAlerts}
          />
        )}

      </AppCard>

      <AppCard className="space-y-5">

        <div><h2 className="text-lg font-semibold">Find a League or Competition</h2><p className="mt-1 text-sm text-muted-foreground">Search by name to open the same shared competition view.</p></div>

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const nextTerm = input.trim(); if (nextTerm.length < 2) return; if (nextTerm === term) void search.refetch(); else setTerm(nextTerm); }}>

          <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Competition name to search" placeholder="Search by competition name" maxLength={100} value={input} onChange={(event) => setInput(event.target.value)} />

          <Button type="submit" variant="outline" disabled={input.trim().length < 2 || search.isFetching}><Search className="size-4" />Search</Button>

        </form>

        {input.trim().length === 1 && <p className="text-xs text-muted-foreground">Type at least 2 characters to search.</p>}

        {search.isFetching && <p role="status" className="text-sm text-muted-foreground">Searching...</p>}

        <RequestError error={search.error} />

        {term && search.data && <><p className="text-xs text-muted-foreground">Results for “{term}” (up to 25).</p><CompetitionList rows={search.data} basePath={basePath} empty="No leagues or cups found. Try another name." /></>}

      </AppCard>

    </div>

    {creating && canCreate && <CompetitionFormDialog onClose={() => setCreating(false)} onSaved={(competitionId) => navigate(`${basePath}/${competitionId}`)} />}

    {canCreate && (

      <GafferAiAssistant

        context="competitions"

        onEntityCreated={() => {

          void queryClient.invalidateQueries({ queryKey: ["shared-competitions"] });

        }}

      />

    )}

  </>;

}



function SettingsSummary({ competition, onEdit, locked, editDisabled = false }: { competition: CompetitionDetail; onEdit: () => void; locked: boolean; editDisabled?: boolean }) {

  const format = competitionFormat(competition);

  const hasLeague = format !== "knockout";

  const rows = [

    ["Format", format === "league" ? "League" : format === "knockout" ? "Knockout only" : "League + Knockout"],

    ["Teams", competition.configuredTeamCount?.toString() ?? "Not configured"],

    ["Match format", `${competition.playersPerSide}-a-side`],

    ["Maximum substitutes", String(competition.maxSubstitutes)],

    ["Red-card suspension", `${competition.redCardSuspensionMatches} match${competition.redCardSuspensionMatches === 1 ? "" : "es"}`],

    ["Yellow-card threshold", `${competition.accumulatedYellowThreshold} cards`],

    ["Yellow-card suspension", `${competition.yellowSuspensionMatches} match${competition.yellowSuspensionMatches === 1 ? "" : "es"}`],

    ["Start date", competition.startDate ?? "Not configured"],

    ["Playing days", competition.allowedPlayingDays.map((day) => weekdays[day]).join(", ") || "Not configured"],

    ["Kickoff", `${competition.defaultKickoffTime} UTC`],

    ...(hasLeague ? [

      ["Fixtures per opponent", competition.fixturesPerOpponent === 2 ? "Twice" : "Once"],

      ["Points", `${competition.pointsWin} win · ${competition.pointsDraw} draw · ${competition.pointsLoss} loss`],

      ["Tiebreaks", "Points · Goal difference · Goals scored"],

    ] : []),

    ...(format === "league_knockout" ? [["Knockout qualifiers", `Top ${competition.qualifierCount ?? "—"}`]] : []),

  ];

  return <AppCard id="settings" className="space-y-4">

    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Settings2 className="size-5 text-primary" />Competition settings</h2><p className="mt-1 text-sm text-muted-foreground">Format-sensitive rules and fixture scheduling configuration.</p></div><Button variant="outline" disabled={editDisabled} onClick={onEdit}>Edit settings</Button></div>

    {locked && <p className="text-sm text-muted-foreground">Structural settings are locked because fixtures or results already exist. Name and season remain editable.</p>}

    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-muted/15 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>

  </AppCard>;

}



function fixtureReadinessStatus(input: {

  configuredCount: number | null;

  remaining: number | null;

  hasGeneratedFixtures: boolean;

  generationConfigured: boolean;

  format: CompetitionFormat;

}) {

  if (input.configuredCount == null) {

    return { message: "Set the required number of teams in Competition Settings before fixtures can be generated.", className: "border-dashed border-border text-muted-foreground" };

  }

  if (input.remaining != null && input.remaining > 0) {

    return { message: `Add ${input.remaining} more ${input.remaining === 1 ? "team" : "teams"} before fixtures can be generated.`, className: "border-dashed border-border text-muted-foreground" };

  }

  if (input.remaining != null && input.remaining < 0) {

    const removed = Math.abs(input.remaining);

    return { message: `Remove ${removed} ${removed === 1 ? "team" : "teams"} to match the configured competition size.`, className: "border-destructive/30 bg-destructive/5 text-destructive" };

  }

  if (input.hasGeneratedFixtures) {

    return { message: "Fixtures have been generated. Participants and structural settings are now locked.", className: "text-muted-foreground" };

  }

  if (!input.generationConfigured) {

    const qualifier = input.format === "league_knockout" ? " and qualifier" : "";

    return { message: `The team list is complete. Finish the schedule${qualifier} settings before generating fixtures.`, className: "border-dashed border-border text-muted-foreground" };

  }

  return { message: `All ${input.configuredCount} teams are ready. You can generate the competition fixtures now.`, className: "text-primary" };

}



function FixtureReadinessPanel({

  participantCount,

  configuredCount,

  remaining,

  hasGeneratedFixtures,

  generationConfigured,

  fixtureStateKnown,

  format,

  generatePending,

  generateError,

  onGenerate,

}: {

  participantCount: number;

  configuredCount: number | null;

  remaining: number | null;

  hasGeneratedFixtures: boolean;

  generationConfigured: boolean;

  fixtureStateKnown: boolean;

  format: CompetitionFormat;

  generatePending: boolean;

  generateError: Error | null;

  onGenerate: () => void;

}) {

  const status = fixtureReadinessStatus({ configuredCount, remaining, hasGeneratedFixtures, generationConfigured, format });



  return (

    <AppCard className="space-y-4">

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>

          <h2 className="text-lg font-semibold">Fixture readiness</h2>

          <p className="mt-1 text-sm text-muted-foreground">

            Teams <span className="font-medium text-foreground">

              {participantCount}{configuredCount ? ` / ${configuredCount}` : ""} added

            </span>

          </p>

        </div>

        {fixtureStateKnown && configuredCount != null && remaining === 0 && generationConfigured && !hasGeneratedFixtures && (

          <Button disabled={generatePending} onClick={onGenerate}>

            {generatePending ? "Generating..." : "Generate Fixtures"}

          </Button>

        )}

      </div>

      <p className={status.className.includes("border") ? `rounded-lg border p-4 text-sm ${status.className}` : `text-sm ${status.className}`}>

        {status.message}

      </p>

      <RequestError error={generateError} />

    </AppCard>

  );

}



function CompetitionResultsPanel({

  competition,

  fixtureStateKnown,

  hasGeneratedFixtures,

  onCreate,

  onEdit,

  onDelete,

}: {

  competition: CompetitionDetail;

  fixtureStateKnown: boolean;

  hasGeneratedFixtures: boolean;

  onCreate: () => void;

  onEdit: (result: CompetitionResult) => void;

  onDelete: (result: CompetitionResult) => void;

}) {

  return (

    <AppCard id="results" className="space-y-4">

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>

          <h2 className="text-lg font-semibold">Recorded results</h2>

          <p className="mt-1 text-sm text-muted-foreground">

            Live-logged and admin-entered results feed the competition automatically.

          </p>

        </div>

        {competition.isAdmin && fixtureStateKnown && !hasGeneratedFixtures && (

          <Button onClick={onCreate} disabled={competition.participants.length < 2}>

            <Plus className="size-4" />Record result

          </Button>

        )}

      </div>

      {competition.results.length === 0 ? (

        <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">

          No competition results have been recorded yet.

        </p>

      ) : (

        <ul className="divide-y divide-border rounded-xl border border-border">

          {competition.results.map((result) => (

            <CompetitionResultRow

              key={result.id}

              result={result}

              canEdit={competition.isAdmin && result.source === "manual"}

              onEdit={() => onEdit(result)}

              onDelete={() => onDelete(result)}

            />

          ))}

        </ul>

      )}

    </AppCard>

  );

}



function CompetitionResultRow({

  result,

  canEdit,

  onEdit,

  onDelete,

}: {

  result: CompetitionResult;

  canEdit: boolean;

  onEdit: () => void;

  onDelete: () => void;

}) {

  return (

    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">

      <div className="min-w-0">

        <p className="text-sm text-muted-foreground">

          {new Date(result.playedAt).toLocaleString()} · {result.source === "live_logged" ? "Live logged" : "Manual result"}

        </p>

        <p className="mt-1 font-semibold">

          {result.homeTeamName} <span className="tabular-nums">{result.homeScore} – {result.awayScore}</span> {result.awayTeamName}

        </p>

      </div>

      {canEdit && (

        <div className="flex shrink-0 gap-2">

          <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="size-3.5" />Edit</Button>

          <Button variant="outline" size="sm" onClick={onDelete}><Trash2 className="size-3.5 text-destructive" />Delete</Button>

        </div>

      )}

    </li>

  );

}



function ParticipantRow({

  participant,

  invite,

  isAdmin,

  isFoundingTeam,

  inviteDisabled,

  removeDisabled,

  onInvite,

  onRevoke,

  onRemove,

  onRename,

  onResolve,

}: {

  participant: Participant;

  invite?: CompetitionInvite;

  isAdmin: boolean;

  isFoundingTeam: boolean;

  inviteDisabled: boolean;

  removeDisabled: boolean;

  onInvite: () => void;

  onRevoke: () => void;

  onRemove: () => void;

  onRename: () => void;

  onResolve: (approve: boolean) => void;

}) {

  const expired = invite ? new Date(invite.expiresAt).getTime() <= Date.now() : false;

  return (

    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">

      <div className="min-w-0 space-y-1">

        <h3 className="break-words font-medium">{participant.displayName}</h3>

        <p className="text-sm text-muted-foreground">

          {participant.teamId ? "Linked to a Gaffer team" : "Awaiting coach / unlinked"}

          {isFoundingTeam ? " · Founding team" : ""}

        </p>

        {invite && !participant.teamId && (

          <p className="break-words text-sm text-muted-foreground">

            {invite.status === "verification" ? "Verification required" : expired ? "Invitation expired" : "Invitation pending"} · {invite.email}<br />

            {invite.status === "verification" && <><strong>Coach's team: {invite.proposedName}</strong><br />

              Confirm this is the intended team before linking.<br /></>}

            {invite.status === "verification" ? "Coach confirmed their team" : `${expired ? "Expired" : "Expires"} ${new Date(invite.expiresAt).toLocaleString()}`}

          </p>

        )}

      </div>

      {isAdmin && (

        <div className="flex shrink-0 flex-wrap gap-2">

          {!participant.teamId && <>

            {invite?.status === "verification" ? <>

              <Button disabled={inviteDisabled} onClick={() => onResolve(true)}>Approve team</Button>

              <Button variant="outline" disabled={inviteDisabled} onClick={() => onResolve(false)}>Reject</Button>

            </> : <>

              <Button variant="outline" disabled={inviteDisabled} onClick={onInvite}>{invite ? "Resend" : "Invite representative"}</Button>

              {invite && <Button variant="outline" onClick={onRevoke}>Revoke</Button>}

            </>}

            <Button variant="outline" onClick={onRename}>Edit name</Button>

          </>}

          {!isFoundingTeam && <Button variant="outline" disabled={removeDisabled} onClick={onRemove}>Remove</Button>}

        </div>

      )}

    </li>

  );

}



function ParticipantManagementPanel({

  competition,

  teamId,

  fixtureStateKnown,

  rosterLocked,

  participantAddDisabled,

  invites,

  notice,

  onAdd,

  onDeleteCompetition,

  onInvite,

  onRevoke,

  onRemove,

  onRename,

  onResolve,

}: {

  competition: CompetitionDetail;

  teamId?: string;

  fixtureStateKnown: boolean;

  rosterLocked: boolean;

  participantAddDisabled: boolean;

  invites: ReturnType<typeof useCompetitionInvites>;

  notice: string;

  onAdd: () => void;

  onDeleteCompetition: () => void;

  onInvite: (participant: Participant, email?: string) => void;

  onRevoke: (invite: CompetitionInvite) => void;

  onRename: (participant: Participant) => void;

  onResolve: (invite: CompetitionInvite, approve: boolean) => void;

  onRemove: (participant: Participant) => void;

}) {

  return (

    <AppCard className="space-y-4">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div className="flex flex-wrap items-center gap-3">

          <h2 className="text-lg font-semibold">Participating teams ({competition.participants.length}{competition.configuredTeamCount ? ` / ${competition.configuredTeamCount}` : ""})</h2>

          {competition.isAdmin && <span className={badgeClass}>Admin</span>}

        </div>

        {competition.isAdmin && <div className="flex flex-wrap gap-2">

          <Button disabled={participantAddDisabled} onClick={onAdd}><Plus className="size-4" />Add team</Button>

          <Button variant="destructive" onClick={onDeleteCompetition}>Delete competition</Button>

        </div>}

      </div>

      {!competition.isAdmin && <p className="text-sm text-muted-foreground">Competition management is available only to the competition admin.</p>}

      {rosterLocked && competition.isAdmin && <p className="text-sm text-muted-foreground">The participant list is locked after fixtures are generated. Invitation linking remains available.</p>}

      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}

      {competition.isAdmin && <>

        {invites.isPending && <p role="status" className="text-sm text-muted-foreground">Loading invitations...</p>}

        <RequestError error={invites.error} />

        {invites.isError && <Button variant="outline" onClick={() => void invites.refetch()}>Retry invitations</Button>}

      </>}

      <ul className="divide-y divide-border">

        {competition.participants.map((participant) => {

          const invite = competition.isAdmin

            ? invites.data?.find((item) => item.competitionTeamId === participant.id)

            : undefined;

          const isFoundingTeam = competition.isAdmin && participant.teamId === teamId;

          return <ParticipantRow

            key={participant.id}

            participant={participant}

            invite={invite}

            isAdmin={competition.isAdmin}

            isFoundingTeam={isFoundingTeam}

            inviteDisabled={!invites.data || invites.isError}

            removeDisabled={!fixtureStateKnown || rosterLocked}

            onInvite={() => onInvite(participant, invite?.email)}

            onRevoke={() => { if (invite) onRevoke(invite); }}

            onRemove={() => onRemove(participant)}

            onRename={() => onRename(participant)}

            onResolve={(approve) => { if (invite) onResolve(invite, approve); }}

          />;

        })}

      </ul>

    </AppCard>

  );

}



type CompetitionDetailsContentProps = {

  id: string;

  competition?: CompetitionDetail;

  isShared: boolean;

  format: CompetitionFormat;

  fixtures: CompetitionFixture[];

  fixturesPending: boolean;

  fixturesError: Error | null;

  fixtureStateKnown: boolean;

  detailPending: boolean;

  detailError: Error | null;

  detailIsError: boolean;

  invites: ReturnType<typeof useCompetitionInvites>;

  teamId?: string;

  canRespond: boolean;

  settingsLocked: boolean;

  rosterLocked: boolean;

  participantAddDisabled: boolean;

  participantCount: number;

  configuredCount: number | null;

  remaining: number | null;

  generationConfigured: boolean;

  hasGeneratedFixtures: boolean;

  generatePending: boolean;

  generateError: Error | null;

  notice: string;

  editing: boolean;

  editingResult: CompetitionResult | "new" | null;

  resultFixture: CompetitionFixture | null;

  action: ActionDialogConfig | null;

  onRetry: () => void;

  onGenerate: () => void;

  onRecordResult: (fixture: CompetitionFixture) => void;

  onCreateResult: () => void;

  onEditResult: (result: CompetitionResult) => void;

  onDeleteResult: (result: CompetitionResult) => void;

  onAdd: () => void;

  onDeleteCompetition: () => void;

  onInvite: (participant: Participant, email?: string) => void;

  onRevoke: (invite: CompetitionInvite) => void;

  onRename: (participant: Participant) => void;

  onResolve: (invite: CompetitionInvite, approve: boolean) => void;

  onRemove: (participant: Participant) => void;

  onEditSettings: () => void;

  onCloseSettings: () => void;

  onSettingsSaved: () => void;

  onCloseResult: () => void;

  onCloseAction: () => void;

  onEntityCreated: () => void;

};



function CompetitionDetailsContent(props: CompetitionDetailsContentProps) {

  const { competition, isShared } = props;

  return (

    <div className={contentClass}>

      {props.detailPending && <p role="status">Loading competition...</p>}

      <RequestError error={props.detailError} />

      {props.detailIsError && <Button variant="outline" onClick={props.onRetry}>Retry</Button>}

      {competition && !isShared && <AppCard>This workspace only displays leagues and cups.</AppCard>}

      {competition && isShared && <SharedCompetitionDetailsContent {...props} competition={competition} />}

    </div>

  );

}



type SharedCompetitionDetailsContentProps = Omit<CompetitionDetailsContentProps, "competition" | "detailPending" | "detailError" | "detailIsError" | "isShared" | "onRetry"> & {

  competition: CompetitionDetail;

};



function SharedCompetitionDetailsContent({

  id,

  competition,

  format,

  fixtures,

  fixturesPending,

  fixturesError,

  fixtureStateKnown,

  invites,

  teamId,

  canRespond,

  settingsLocked,

  rosterLocked,

  participantAddDisabled,

  participantCount,

  configuredCount,

  remaining,

  generationConfigured,

  hasGeneratedFixtures,

  generatePending,

  generateError,

  notice,

  editing,

  editingResult,

  resultFixture,

  action,

  onGenerate,

  onRecordResult,

  onCreateResult,

  onEditResult,

  onDeleteResult,

  onAdd,

  onDeleteCompetition,

  onInvite,

  onRevoke,

  onRemove,

  onRename,

  onResolve,

  onEditSettings,

  onCloseSettings,

  onSettingsSaved,

  onCloseResult,

  onCloseAction,

  onEntityCreated,

}: SharedCompetitionDetailsContentProps) {

  return <>

    {format !== "knockout" && <StandingsDisplay

      competitions={[{ id: competition.id, name: competition.name, type: competition.type, season: competition.season, standings: competition.standings }]}

      title={format === "league_knockout" ? "League standings" : "Standings"}

      showCompetitionHeaders={false}

      compactOnMobile

    />}

    <CompetitionPlayerStats competitionId={id} participants={competition.participants} />

    {competition.isAdmin && <FixtureReadinessPanel

      participantCount={participantCount}

      configuredCount={configuredCount}

      remaining={remaining}

      hasGeneratedFixtures={hasGeneratedFixtures}

      generationConfigured={generationConfigured}

      fixtureStateKnown={fixtureStateKnown}

      format={format}

      generatePending={generatePending}

      generateError={generateError}

      onGenerate={onGenerate}

    />}

    {fixturesPending && <AppCard><p role="status" className="text-sm text-muted-foreground">Loading fixtures...</p></AppCard>}

    <RequestError error={fixturesError} />

    {hasGeneratedFixtures && <CompetitionFixturesView

      format={format}

      fixtures={fixtures}

      participants={competition.participants}

      isAdmin={competition.isAdmin}

      viewerTeamId={teamId ?? null}

      canRespond={canRespond}

      onRecordResult={onRecordResult}

    />}

    <CompetitionResultsPanel

      competition={competition}

      fixtureStateKnown={fixtureStateKnown}

      hasGeneratedFixtures={hasGeneratedFixtures}

      onCreate={onCreateResult}

      onEdit={onEditResult}

      onDelete={onDeleteResult}

    />

    <ParticipantManagementPanel

      competition={competition}

      teamId={teamId}

      fixtureStateKnown={fixtureStateKnown}

      rosterLocked={rosterLocked}

      participantAddDisabled={participantAddDisabled}

      invites={invites}

      notice={notice}

      onAdd={onAdd}

      onDeleteCompetition={onDeleteCompetition}

      onInvite={onInvite}

      onRevoke={onRevoke}

      onRemove={onRemove}

      onRename={onRename}

      onResolve={onResolve}

    />

    {competition.isAdmin && <SettingsSummary competition={competition} locked={settingsLocked} editDisabled={!fixtureStateKnown} onEdit={onEditSettings} />}

    <CompetitionManagementDialogs

      competition={competition}

      settingsLocked={settingsLocked}

      editing={editing}

      editingResult={editingResult}

      resultFixture={resultFixture}

      action={action}

      onCloseSettings={onCloseSettings}

      onSettingsSaved={onSettingsSaved}

      onCloseResult={onCloseResult}

      onCloseAction={onCloseAction}

    />

    {competition.isAdmin && !competition.archivedAt && !participantAddDisabled && <GafferAiAssistant context="competitions" competitionId={id} onEntityCreated={onEntityCreated} />}

  </>;

}



function CompetitionManagementDialogs({

  competition,

  settingsLocked,

  editing,

  editingResult,

  resultFixture,

  action,

  onCloseSettings,

  onSettingsSaved,

  onCloseResult,

  onCloseAction,

}: {

  competition: CompetitionDetail;

  settingsLocked: boolean;

  editing: boolean;

  editingResult: CompetitionResult | "new" | null;

  resultFixture: CompetitionFixture | null;

  action: ActionDialogConfig | null;

  onCloseSettings: () => void;

  onSettingsSaved: () => void;

  onCloseResult: () => void;

  onCloseAction: () => void;

}) {

  if (!competition.isAdmin) return null;

  return <>

    {editing && <CompetitionFormDialog competition={competition} locked={settingsLocked} onClose={onCloseSettings} onSaved={onSettingsSaved} />}

    {editingResult && <CompetitionResultDialog

      competitionId={competition.id}

      participants={competition.participants}

      result={editingResult === "new" ? undefined : editingResult}

      fixture={resultFixture ?? undefined}

      onClose={onCloseResult}

    />}

    {action && <CompetitionActionDialog config={action} onClose={onCloseAction} />}

  </>;

}



function CompetitionDetails({ id }: { id: string }) {

  const navigate = useNavigate();

  const location = useLocation();

  const queryClient = useQueryClient();

  const { team, accountKind } = useAuth();

  const basePath = competitionBasePath(accountKind);

  const detail = useCompetition(id);

  const fixturesQuery = useCompetitionFixtures(id);

  const competition = detail.data;

  const fixtures = fixturesQuery.data ?? emptyFixtures;

  const isShared = competition?.type === "league" || competition?.type === "cup";

  const invites = useCompetitionInvites(id, !!competition?.isAdmin && isShared);

  const [editing, setEditing] = useState(false);

  const [editingResult, setEditingResult] = useState<CompetitionResult | "new" | null>(null);

  const [resultFixture, setResultFixture] = useState<CompetitionFixture | null>(null);

  const [action, setAction] = useState<ActionDialogConfig | null>(null);

  const [notice, setNotice] = useState("");

  const archive = useCompetitionMutation((archived: boolean) => setCompetitionArchived(id, archived));

  const hideDetail = useCompetitionMutation((hidden: boolean) => setCompetitionHidden(id, hidden));

  const [lifecycleError, setLifecycleError] = useState("");

  const generate = useCompetitionMutation((regenerate: boolean) => generateCompetitionFixtures(id, regenerate));



  const format = competition && isShared ? competitionFormat(competition) : "league";

  const fixtureStateKnown = fixturesQuery.isSuccess;

  const settingsLocked = fixtures.length > 0 || (competition?.results.length ?? 0) > 0;

  const rosterLocked = fixtures.length > 0;

  const configuredCount = competition?.configuredTeamCount ?? null;

  const participantCount = competition?.participants.length ?? 0;

  const remaining = configuredCount == null ? null : configuredCount - participantCount;

  const generationConfigured = Boolean(

    competition?.startDate &&

    competition.allowedPlayingDays.length &&

    (format !== "league_knockout" || competition.qualifierCount),

  );

  const hasGeneratedFixtures = fixtures.length > 0;

  const participantAddDisabled = !fixtureStateKnown || rosterLocked || (configuredCount != null && participantCount >= configuredCount);



  useEffect(() => {

    if (!fixturesQuery.isSuccess || !location.hash.startsWith("#fixture-")) return;

    const id = window.setTimeout(() => {

      document.getElementById(location.hash.slice(1))?.scrollIntoView({

        behavior: "smooth",

        block: "center",

      });

    }, 0);

    return () => window.clearTimeout(id);

  }, [fixturesQuery.isSuccess, location.hash]);



  const manualFixtureByResult = useMemo(() => new Map(fixtures.filter((fixture) => fixture.legacyResultId).map((fixture) => [fixture.legacyResultId!, fixture])), [fixtures]);



  const openInvite = (participant: Participant, email?: string) => setAction({

    title: email ? "Resend invitation" : "Invite representative",

    description: `Invite a coach or authorized assistant for ${participant.displayName}. Issuing an invitation replaces any previous pending link for this team.`,

    label: "Representative email address", inputType: "email", initialValue: email,

    confirm: email ? "Resend invitation" : "Send invitation",

    action: (value) => inviteCoach(participant.id, value),

    onSuccess: () => setNotice(`Invitation issued for ${participant.displayName}.`),

  });



  const openFixtureResult = (fixture: CompetitionFixture) => { setResultFixture(fixture); setEditingResult("new"); };



  return <>

    {competition && <AppCard className="mx-6 mb-4 space-y-3 sm:mx-8 lg:mx-10">

      {competition.archivedAt && <p className="text-sm text-muted-foreground"><Archive className="mr-2 inline size-4" />This competition has been archived. Its historical fixtures, standings and player statistics remain available.</p>}

      <div className="flex flex-wrap items-center gap-2">

        <Button size="sm" variant="outline" disabled={hideDetail.isPending} onClick={() => { setLifecycleError(""); hideDetail.mutate(!competition.hiddenByMe, { onError: (error) => setLifecycleError(error.message) }); }}>

          <EyeOff className="size-4" />{competition.hiddenByMe ? "Show in my feed" : "Hide from my feed"}

        </Button>

        {competition.isAdmin && <Button size="sm" variant="outline" disabled={archive.isPending} onClick={() => {

          const archived = !competition.archivedAt;

          if (!window.confirm(archived ? "Archive this competition for everyone? Results and standings will remain available." : "Restore this competition for everyone?")) return;

          setLifecycleError(""); archive.mutate(archived, { onError: (error) => setLifecycleError(error.message) });

        }}>

          {competition.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}

          {competition.archivedAt ? "Restore competition" : "Archive competition"}

        </Button>}

      </div>

      {lifecycleError && <p role="alert" className="text-sm text-destructive">{lifecycleError}</p>}

    </AppCard>}

    <PageHeader title={isShared ? competition.name : "Competition details"}

      subtitle={isShared ? `${formatLabel(competition.type, competition.format)}${competition.season ? ` · ${competition.season}` : ""}` : undefined}

      actions={<div className="flex flex-wrap items-center gap-2">

        {competition?.isAdmin && !competition.archivedAt && isShared && <a href="#settings" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><Settings2 className="size-4" />Settings</a>}

        <Link to={basePath} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><ArrowLeft className="size-4" />All competitions</Link>

      </div>} />

    <CompetitionDetailsContent

      id={id}

      competition={competition?.archivedAt ? { ...competition, isAdmin: false } : competition}

      isShared={isShared}

      format={format}

      fixtures={fixtures}

      fixturesPending={fixturesQuery.isPending}

      fixturesError={fixturesQuery.error}

      fixtureStateKnown={fixtureStateKnown}

      detailPending={detail.isPending}

      detailError={detail.error}

      detailIsError={detail.isError}

      invites={invites}

      teamId={team?.id}

      canRespond={team?.role === "coach" && !competition?.archivedAt}

      settingsLocked={settingsLocked}

      rosterLocked={rosterLocked}

      participantAddDisabled={participantAddDisabled}

      participantCount={participantCount}

      configuredCount={configuredCount}

      remaining={remaining}

      generationConfigured={generationConfigured}

      hasGeneratedFixtures={hasGeneratedFixtures}

      generatePending={generate.isPending}

      generateError={generate.error}

      notice={notice}

      editing={editing}

      editingResult={editingResult}

      resultFixture={resultFixture}

      action={action}

      onRetry={() => { void detail.refetch(); }}

      onGenerate={() => generate.mutate(false)}

      onRecordResult={openFixtureResult}

      onCreateResult={() => { setResultFixture(null); setEditingResult("new"); }}

      onEditResult={(result) => {

        setResultFixture(manualFixtureByResult.get(result.id) ?? null);

        setEditingResult(result);

      }}

      onDeleteResult={(result) => setAction({

        title: "Delete result",

        description: `Delete ${result.homeTeamName} ${result.homeScore}–${result.awayScore} ${result.awayTeamName}? The standings and fixture will be recalculated where safe.`,

        confirm: "Delete result",

        destructive: true,

        action: () => deleteCompetitionResult(id, result.id),

      })}

      onAdd={() => setAction({

        title: "Add participating team",

        description: "Add a team name for this competition. You can then invite its coach.",

        label: "Team name",

        confirm: "Add team",

        action: (value) => addParticipant(id, value),

      })}

      onDeleteCompetition={() => setAction({

        title: "Delete competition",

        description: `Delete ${competition?.name}? This cannot be undone. Its participants, fixtures and invitations will also be removed.`,

        confirm: "Delete competition",

        destructive: true,

        action: () => deleteCompetition(id),

        onSuccess: () => navigate(basePath, { replace: true }),

      })}

      onInvite={openInvite}

      onRename={(participant) => setAction({

        title: "Edit participant name",

        description: `Correct the unlinked participant ${participant.displayName}. This does not rename a registered Gaffer team.`,

        label: "Team name", initialValue: participant.displayName, confirm: "Save name",

        action: (value) => renameParticipant(id, participant.id, value),

      })}

      onResolve={(invite, approve) => setAction({

        title: approve ? "Approve team verification" : "Reject team verification",

        description: approve

          ? `Link ${invite.proposedName} to ${competition?.participants.find(p => p.id === invite.competitionTeamId)?.displayName}? The registered team name will be used.`

          : `Reject ${invite.proposedName}'s claim? You can send a corrected invitation afterward.`,

        confirm: approve ? "Approve and link" : "Reject request",

        destructive: !approve,

        action: () => resolveTeamVerification(invite.id, approve),

        onSuccess: () => setNotice(approve ? "Team verified and linked." : "Verification rejected. You can send a new invitation."),

      })}

      onRevoke={(invite) => setAction({

        title: "Revoke invitation",

        description: `Revoke the invitation to ${invite.email} for ${competition?.participants.find((participant) => participant.id === invite.competitionTeamId)?.displayName ?? "this team"}?`,

        confirm: "Revoke invitation",

        destructive: true,

        action: () => revokeInvite(invite.id),

      })}

      onRemove={(participant) => setAction({

        title: "Remove participating team",

        description: `Remove ${participant.displayName} from this competition? Any invitations for this participant will also be removed.`,

        confirm: "Remove team",

        destructive: true,

        action: () => removeParticipant(id, participant.id),

      })}

      onEditSettings={() => setEditing(true)}

      onCloseSettings={() => setEditing(false)}

      onSettingsSaved={() => setEditing(false)}

      onCloseResult={() => { setEditingResult(null); setResultFixture(null); }}

      onCloseAction={() => setAction(null)}

      onEntityCreated={() => { void queryClient.invalidateQueries({ queryKey: ["shared-competitions"] }); }}

    />

  </>;

}
