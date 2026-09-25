import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Search, Settings2, Trash2, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AppCard } from "@/components/app/AppCard";
import { StandingsDisplay } from "@/components/standings/StandingsDisplay";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompetition, useCompetitionFixtures, useCompetitionInvites, useCompetitionSearch, useMyCompetitions, useCompetitionMutation } from "./hooks";
import { addParticipant, deleteCompetition, deleteCompetitionResult, generateCompetitionFixtures, inviteCoach, removeParticipant, revokeInvite } from "./api";
import { CompetitionActionDialog, CompetitionFormDialog, RequestError, type ActionDialogConfig } from "./CompetitionDialogs";
import { CompetitionResultDialog } from "./CompetitionResultDialog";
import { CompetitionFixturesView } from "./CompetitionFixturesView";
import type { CompetitionDetail, CompetitionFixture, CompetitionFormat, CompetitionResult, CompetitionSummary, Participant } from "./types";

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
  return id ? <CompetitionDetails key={id} id={id} /> : <CompetitionWorkspace />;
}

function CompetitionList({ rows, empty, basePath }: { rows: CompetitionSummary[]; empty: string; basePath: string }) {
  if (!rows.length) return <p className="py-5 text-sm text-muted-foreground">{empty}</p>;
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => (
    <Link key={row.id} to={`${basePath}/${row.id}`} className="rounded-xl border border-border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start justify-between gap-3"><h3 className="break-words font-semibold">{row.name}</h3>{row.isAdmin && <span className={badgeClass}>Admin</span>}</div>
      <p className="mt-2 text-sm text-muted-foreground">{formatLabel(row.type, row.format)}{row.season ? ` · ${row.season}` : ""}</p>
      <p className="mt-3 text-sm">{row.participantCount}{row.configuredTeamCount ? ` / ${row.configuredTeamCount}` : ""} {row.participantCount === 1 ? "team" : "teams"}</p>
    </Link>
  ))}</div>;
}

function CompetitionWorkspace() {
  const navigate = useNavigate();
  const { team, accountKind } = useAuth();
  const basePath = competitionBasePath(accountKind);
  const canCreate = team?.role === "coach";
  const mine = useMyCompetitions();
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const search = useCompetitionSearch(term);
  const [creating, setCreating] = useState(false);

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
      <AppCard className="space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5 text-primary" />My Leagues & Competitions</h2>
        {mine.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your competitions...</p>}
        <RequestError error={mine.error} />
        {mine.isError && <Button variant="outline" onClick={() => void mine.refetch()}>Retry</Button>}
        {mine.data && <CompetitionList rows={mine.data} basePath={basePath} empty="Your team has no leagues or cups yet." />}
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
  </>;
}

function SettingsSummary({ competition, onEdit, locked, editDisabled = false }: { competition: CompetitionDetail; onEdit: () => void; locked: boolean; editDisabled?: boolean }) {
  const format = competitionFormat(competition);
  const hasLeague = format !== "knockout";
  const rows = [
    ["Format", format === "league" ? "League" : format === "knockout" ? "Knockout only" : "League + Knockout"],
    ["Teams", competition.configuredTeamCount?.toString() ?? "Not configured"],
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

function CompetitionDetails({ id }: { id: string }) {
  const navigate = useNavigate();
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
  const generate = useCompetitionMutation((regenerate: boolean) => generateCompetitionFixtures(id, regenerate));

  const format = competition && isShared ? competitionFormat(competition) : "league";
  const fixtureStateKnown = fixturesQuery.isSuccess;
  const settingsLocked = fixtures.length > 0 || (competition?.results.length ?? 0) > 0;
  const rosterLocked = fixtures.length > 0;
  const configuredCount = competition?.configuredTeamCount ?? null;
  const participantCount = competition?.participants.length ?? 0;
  const remaining = configuredCount == null ? null : configuredCount - participantCount;
  const ready = configuredCount != null && remaining === 0;
  const generationConfigured = Boolean(
    competition?.startDate &&
    competition.allowedPlayingDays.length &&
    (format !== "league_knockout" || competition.qualifierCount),
  );
  const canGenerate = fixtureStateKnown && ready && generationConfigured;
  const hasGeneratedFixtures = fixtures.length > 0;
  const participantAddDisabled = !fixtureStateKnown || rosterLocked || (configuredCount != null && participantCount >= configuredCount);

  const manualFixtureByResult = useMemo(() => new Map(fixtures.filter((fixture) => fixture.legacyResultId).map((fixture) => [fixture.legacyResultId!, fixture])), [fixtures]);

  const openInvite = (participant: Participant, email?: string) => setAction({
    title: email ? "Resend invitation" : "Invite coach",
    description: `Invite a coach for ${participant.displayName}. Issuing an invitation replaces any previous pending link for this team.`,
    label: "Coach email address", inputType: "email", initialValue: email,
    confirm: email ? "Resend invitation" : "Send invitation",
    action: (value) => inviteCoach(participant.id, value),
    onSuccess: () => setNotice(`Invitation issued for ${participant.displayName}.`),
  });

  const openFixtureResult = (fixture: CompetitionFixture) => { setResultFixture(fixture); setEditingResult("new"); };

  return <>
    <PageHeader title={isShared ? competition.name : "Competition details"}
      subtitle={isShared ? `${formatLabel(competition.type, competition.format)}${competition.season ? ` · ${competition.season}` : ""}` : undefined}
      actions={<div className="flex flex-wrap items-center gap-2">
        {competition?.isAdmin && isShared && <a href="#settings" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><Settings2 className="size-4" />Settings</a>}
        <Link to={basePath} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><ArrowLeft className="size-4" />All competitions</Link>
      </div>} />
    <div className={contentClass}>
      {detail.isPending && <p role="status">Loading competition...</p>}
      <RequestError error={detail.error} />
      {detail.isError && <Button variant="outline" onClick={() => void detail.refetch()}>Retry</Button>}
      {competition && !isShared && <AppCard>This workspace only displays leagues and cups.</AppCard>}
      {competition && isShared && <>
        {format !== "knockout" && <StandingsDisplay competitions={[{ id: competition.id, name: competition.name, type: competition.type, season: competition.season, standings: competition.standings }]} title={format === "league_knockout" ? "League standings" : "Standings"} showCompetitionHeaders={false} compactOnMobile />}

        {competition.isAdmin && <AppCard className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Fixture readiness</h2><p className="mt-1 text-sm text-muted-foreground">Teams <span className="font-medium text-foreground">{participantCount}{configuredCount ? ` / ${configuredCount}` : ""} added</span></p></div>{canGenerate && !hasGeneratedFixtures && <Button disabled={generate.isPending} onClick={() => generate.mutate(false)}>{generate.isPending ? "Generating..." : "Generate Fixtures"}</Button>}</div>
          {configuredCount == null ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Set the required number of teams in Competition Settings before fixtures can be generated.</p> : remaining != null && remaining > 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Add {remaining} more {remaining === 1 ? "team" : "teams"} before fixtures can be generated.</p> : remaining != null && remaining < 0 ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Remove {Math.abs(remaining)} {Math.abs(remaining) === 1 ? "team" : "teams"} to match the configured competition size.</p> : hasGeneratedFixtures ? <p className="text-sm text-muted-foreground">Fixtures have been generated. Participants and structural settings are now locked.</p> : !generationConfigured ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">The team list is complete. Finish the schedule{format === "league_knockout" ? " and qualifier" : ""} settings before generating fixtures.</p> : <p className="text-sm text-primary">All {configuredCount} teams are ready. You can generate the competition fixtures now.</p>}
          <RequestError error={generate.error} />
        </AppCard>}

        {fixturesQuery.isPending && <AppCard><p role="status" className="text-sm text-muted-foreground">Loading fixtures...</p></AppCard>}
        <RequestError error={fixturesQuery.error} />
        {hasGeneratedFixtures && <CompetitionFixturesView format={format} fixtures={fixtures} participants={competition.participants} isAdmin={competition.isAdmin} viewerTeamId={team?.id ?? null} canRespond={team?.role === "coach"} onRecordResult={openFixtureResult} />}

        <AppCard id="results" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Recorded results</h2><p className="mt-1 text-sm text-muted-foreground">Live-logged and admin-entered results feed the competition automatically.</p></div>{competition.isAdmin && fixtureStateKnown && !hasGeneratedFixtures && <Button onClick={() => { setResultFixture(null); setEditingResult("new"); }} disabled={competition.participants.length < 2}><Plus className="size-4" />Record result</Button>}</div>
          {competition.results.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No competition results have been recorded yet.</p> : <ul className="divide-y divide-border rounded-xl border border-border">{competition.results.map((result) => <li key={result.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm text-muted-foreground">{new Date(result.playedAt).toLocaleString()} · {result.source === "live_logged" ? "Live logged" : "Manual result"}</p><p className="mt-1 font-semibold">{result.homeTeamName} <span className="tabular-nums">{result.homeScore} – {result.awayScore}</span> {result.awayTeamName}</p></div>{competition.isAdmin && result.source === "manual" && <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => { setResultFixture(manualFixtureByResult.get(result.id) ?? null); setEditingResult(result); }}><Pencil className="size-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => setAction({ title: "Delete result", description: `Delete ${result.homeTeamName} ${result.homeScore}–${result.awayScore} ${result.awayTeamName}? The standings and fixture will be recalculated where safe.`, confirm: "Delete result", destructive: true, action: () => deleteCompetitionResult(id, result.id) })}><Trash2 className="size-3.5 text-destructive" />Delete</Button></div>}</li>)}</ul>}
        </AppCard>

        <AppCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Participating teams ({participantCount}{configuredCount ? ` / ${configuredCount}` : ""})</h2>{competition.isAdmin && <span className={badgeClass}>Admin</span>}</div>{competition.isAdmin && <div className="flex flex-wrap gap-2"><Button disabled={participantAddDisabled} onClick={() => setAction({ title: "Add participating team", description: "Add a team name for this competition. You can then invite its coach.", label: "Team name", confirm: "Add team", action: (value) => addParticipant(id, value) })}><Plus className="size-4" />Add team</Button><Button variant="destructive" onClick={() => setAction({ title: "Delete competition", description: `Delete ${competition.name}? This cannot be undone. Its participants, fixtures and invitations will also be removed.`, confirm: "Delete competition", destructive: true, action: () => deleteCompetition(id), onSuccess: () => navigate(basePath, { replace: true }) })}>Delete competition</Button></div>}</div>
          {!competition.isAdmin && <p className="text-sm text-muted-foreground">Competition management is available only to the competition admin.</p>}
          {rosterLocked && competition.isAdmin && <p className="text-sm text-muted-foreground">The participant list is locked after fixtures are generated. Invitation linking remains available.</p>}
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {competition.isAdmin && <>{invites.isPending && <p role="status" className="text-sm text-muted-foreground">Loading invitations...</p>}<RequestError error={invites.error} />{invites.isError && <Button variant="outline" onClick={() => void invites.refetch()}>Retry invitations</Button>}</>}
          <ul className="divide-y divide-border">{competition.participants.map((participant) => { const invite = competition.isAdmin ? invites.data?.find((item) => item.competitionTeamId === participant.id) : undefined; const expired = invite ? new Date(invite.expiresAt).getTime() <= Date.now() : false; const foundingTeam = competition.isAdmin && participant.teamId === team?.id; return <li key={participant.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 space-y-1"><h3 className="break-words font-medium">{participant.displayName}</h3><p className="text-sm text-muted-foreground">{participant.teamId ? "Linked to a Gaffer team" : "Awaiting coach / unlinked"}{foundingTeam ? " · Founding team" : ""}</p>{invite && !participant.teamId && <p className="break-words text-sm text-muted-foreground">{expired ? "Invitation expired" : "Invitation pending"} · {invite.email}<br />{expired ? "Expired" : "Expires"} {new Date(invite.expiresAt).toLocaleString()}</p>}</div>{competition.isAdmin && <div className="flex shrink-0 flex-wrap gap-2">{!participant.teamId && <><Button variant="outline" disabled={!invites.data || invites.isError} onClick={() => openInvite(participant, invite?.email)}>{invite ? "Resend" : "Invite coach"}</Button>{invite && <Button variant="outline" onClick={() => setAction({ title: "Revoke invitation", description: `Revoke the invitation to ${invite.email} for ${participant.displayName}?`, confirm: "Revoke invitation", destructive: true, action: () => revokeInvite(invite.id) })}>Revoke</Button>}</>}{!foundingTeam && <Button variant="outline" disabled={!fixtureStateKnown || rosterLocked} onClick={() => setAction({ title: "Remove participating team", description: `Remove ${participant.displayName} from this competition? Any invitations for this participant will also be removed.`, confirm: "Remove team", destructive: true, action: () => removeParticipant(id, participant.id) })}>Remove</Button>}</div>}</li>; })}</ul>
        </AppCard>

        {competition.isAdmin && <SettingsSummary competition={competition} locked={settingsLocked} editDisabled={!fixtureStateKnown} onEdit={() => setEditing(true)} />}
        {editing && competition.isAdmin && <CompetitionFormDialog competition={competition} locked={settingsLocked} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
        {editingResult && competition.isAdmin && <CompetitionResultDialog competitionId={competition.id} participants={competition.participants} result={editingResult === "new" ? undefined : editingResult} fixture={resultFixture ?? undefined} onClose={() => { setEditingResult(null); setResultFixture(null); }} />}
        {action && competition.isAdmin && <CompetitionActionDialog config={action} onClose={() => setAction(null)} />}
      </>}
    </div>
  </>;
}
