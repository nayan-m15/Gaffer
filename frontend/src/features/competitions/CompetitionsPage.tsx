import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trophy, ArrowLeft, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AppCard } from "@/components/app/AppCard";
import { StandingsDisplay } from "@/components/standings/StandingsDisplay";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompetition, useCompetitionInvites, useCompetitionSearch, useMyCompetitions } from "./hooks";
import { addParticipant, deleteCompetition, inviteCoach, removeParticipant, revokeInvite } from "./api";
import { CompetitionActionDialog, CompetitionFormDialog, RequestError, type ActionDialogConfig } from "./CompetitionDialogs";
import type { CompetitionSummary, Participant } from "./types";

const contentClass = "mx-auto w-full max-w-[1600px] space-y-6 px-6 pb-10 sm:px-8 lg:px-10";
const badgeClass = "rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary";

function competitionBasePath(accountKind: "coach" | "player" | "new") {
  return accountKind === "player" ? "/player/competitions" : "/competitions";
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
      <p className="mt-2 text-sm text-muted-foreground">{row.type === "league" ? "League" : "Cup"}{row.season ? ` · ${row.season}` : ""}</p>
      <p className="mt-3 text-sm">{row.participantCount} {row.participantCount === 1 ? "team" : "teams"}</p>
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

    if (nextTerm.length < 2) {
      setTerm("");
      return;
    }

    const timer = window.setTimeout(() => setTerm(nextTerm), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  return <>
    <PageHeader title="Leagues & Competitions" subtitle={canCreate ? "Find competitions, view standings, and manage the ones you administer." : "Find competitions and view league or cup standings."}
      actions={canCreate ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />Create a League or Competition</Button> : undefined} />
    <div className={contentClass}>
      <AppCard className="space-y-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5 text-primary" />My Leagues & Competitions</h2>
        {mine.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your competitions...</p>}
        <RequestError error={mine.error} />
        {mine.isError && <Button variant="outline" onClick={() => void mine.refetch()}>Retry</Button>}
        {mine.data && <CompetitionList rows={mine.data} basePath={basePath} empty="Your team has no leagues or cups yet." />}
      </AppCard>
      <AppCard className="space-y-5">
        <div><h2 className="text-lg font-semibold">Find a League or Competition</h2><p className="mt-1 text-sm text-muted-foreground">Search by name to view standings and participating teams. Results update as you type.</p></div>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
          event.preventDefault();
          const nextTerm = input.trim();
          if (nextTerm.length < 2) return;
          if (nextTerm === term) void search.refetch();
          else setTerm(nextTerm);
        }}>
          <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" aria-label="Competition name to search" placeholder="Search by competition name" maxLength={100} value={input} onChange={(e) => setInput(e.target.value)} />
          <Button type="submit" variant="outline" disabled={input.trim().length < 2 || search.isFetching}><Search className="size-4" />Search</Button>
        </form>
        {input.trim().length === 1 && <p className="text-xs text-muted-foreground">Type at least 2 characters to search.</p>}
        {search.isFetching && <p role="status" className="text-sm text-muted-foreground">Searching...</p>}
        <RequestError error={search.error} />
        {term && search.data && <><p className="text-xs text-muted-foreground">Results for “{term}” (up to 25). Refine your search if needed.</p><CompetitionList rows={search.data} basePath={basePath} empty="No leagues or cups found. Try another name." /></>}
      </AppCard>
    </div>
    {creating && canCreate && <CompetitionFormDialog onClose={() => setCreating(false)} onSaved={(id) => navigate(`${basePath}/${id}`)} />}
  </>;
}

function CompetitionDetails({ id }: { id: string }) {
  const navigate = useNavigate();
  const { team, accountKind } = useAuth();
  const basePath = competitionBasePath(accountKind);
  const detail = useCompetition(id);
  const competition = detail.data;
  const isShared = competition?.type === "league" || competition?.type === "cup";
  const invites = useCompetitionInvites(id, !!competition?.isAdmin && isShared);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<ActionDialogConfig | null>(null);
  const [notice, setNotice] = useState("");
  const openInvite = (participant: Participant, email?: string) => setAction({
    title: email ? "Resend invitation" : "Invite coach",
    description: `Invite a coach for ${participant.displayName}. Issuing an invitation replaces any previous pending link for this team.`,
    label: "Coach email address", inputType: "email", initialValue: email,
    confirm: email ? "Resend invitation" : "Send invitation",
    action: (value) => inviteCoach(participant.id, value),
    onSuccess: () => setNotice(`Invitation issued for ${participant.displayName}.`),
  });

  return <>
    <PageHeader title={isShared ? competition.name : "Competition details"}
      subtitle={isShared ? `${competition.type === "league" ? "League" : "Cup"}${competition.season ? ` · ${competition.season}` : ""}` : undefined}
      actions={<Link to={basePath} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"><ArrowLeft className="size-4" />All competitions</Link>} />
    <div className={contentClass}>
      {detail.isPending && <p role="status">Loading competition...</p>}
      <RequestError error={detail.error} />
      {detail.isError && <Button variant="outline" onClick={() => void detail.refetch()}>Retry</Button>}
      {competition && !isShared && <AppCard>This workspace only displays leagues and cups.</AppCard>}
      {competition && isShared && <>
        <StandingsDisplay
          competitions={[{
            id: competition.id,
            name: competition.name,
            type: competition.type,
            season: competition.season,
            standings: competition.standings,
          }]}
          title="Standings"
          showCompetitionHeaders={false}
          compactOnMobile
        />

        <AppCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">Participating teams ({competition.participants.length})</h2>{competition.isAdmin && <span className={badgeClass}>Admin</span>}</div>
            {competition.isAdmin && <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAction({
                title: "Add participating team", description: "Add a team name for this competition. You can then invite its coach.",
                label: "Team name", confirm: "Add team", action: (value) => addParticipant(id, value),
              })}><Plus className="size-4" />Add team</Button>
              <Button variant="outline" onClick={() => setEditing(true)}>Edit competition</Button>
              <Button variant="destructive" onClick={() => setAction({
                title: "Delete competition", description: `Delete ${competition.name}? This cannot be undone. Its participants and invitations will also be removed.`,
                confirm: "Delete competition", destructive: true, action: () => deleteCompetition(id),
                onSuccess: () => navigate(basePath, { replace: true }),
              })}>Delete competition</Button>
            </div>}
          </div>
          {!competition.isAdmin && <p className="text-sm text-muted-foreground">Standings and participating teams are read-only. Competition management is available only to the competition admin.</p>}
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          {competition.isAdmin && <>
            {invites.isPending && <p role="status" className="text-sm text-muted-foreground">Loading invitations...</p>}
            <RequestError error={invites.error} />
            {invites.isError && <Button variant="outline" onClick={() => void invites.refetch()}>Retry invitations</Button>}
          </>}
          <ul className="divide-y divide-border">
            {competition.participants.map((participant) => {
              const invite = competition.isAdmin ? invites.data?.find((item) => item.competitionTeamId === participant.id) : undefined;
              const expired = invite ? new Date(invite.expiresAt).getTime() <= Date.now() : false;
              const foundingTeam = competition.isAdmin && participant.teamId === team?.id;
              return <li key={participant.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words font-medium">{participant.displayName}</h3>
                  <p className="text-sm text-muted-foreground">{participant.teamId ? "Linked to a Gaffer team" : "Awaiting coach / unlinked"}{foundingTeam ? " · Founding team" : ""}</p>
                  {invite && !participant.teamId && <p className="break-words text-sm text-muted-foreground">{expired ? "Invitation expired" : "Invitation pending"} · {invite.email}<br />{expired ? "Expired" : "Expires"} {new Date(invite.expiresAt).toLocaleString()}</p>}
                </div>
                {competition.isAdmin && <div className="flex shrink-0 flex-wrap gap-2">
                  {!participant.teamId && <>
                    <Button variant="outline" disabled={!invites.data || invites.isError} onClick={() => openInvite(participant, invite?.email)}>{invite ? "Resend" : "Invite coach"}</Button>
                    {invite && <Button variant="outline" onClick={() => setAction({
                      title: "Revoke invitation", description: `Revoke the invitation to ${invite.email} for ${participant.displayName}?`,
                      confirm: "Revoke invitation", destructive: true, action: () => revokeInvite(invite.id),
                    })}>Revoke</Button>}
                  </>}
                  {!foundingTeam && <Button variant="outline" onClick={() => setAction({
                    title: "Remove participating team", description: `Remove ${participant.displayName} from this competition? Any invitations for this participant will also be removed.`,
                    confirm: "Remove team", destructive: true, action: () => removeParticipant(id, participant.id),
                  })}>Remove</Button>}
                </div>}
              </li>;
            })}
          </ul>
          {!competition.participants.length && <p className="text-sm text-muted-foreground">No participating teams yet.</p>}
        </AppCard>
        {editing && competition.isAdmin && <CompetitionFormDialog competition={competition} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
        {action && competition.isAdmin && <CompetitionActionDialog config={action} onClose={() => setAction(null)} />}
      </>}
    </div>
  </>;
}
