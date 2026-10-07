import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { MatchEventType, MatchLogEvent, MatchRecord, MatchSquadAthlete, SessionReport } from './types';

type Amendment = {
  id: string; proposedByTeamId: string; status: string; action: string; reason: string;
  responseReason: string | null; approvals: { home: boolean; away: boolean };
  side: 'home' | 'away'; before: { eventType: string; minute: number; playerLabel: string | null } | null;
  after: { eventType: string; minute: number; playerLabel: string | null } | null;
  proposedScore: { home: number; away: number };
};
const eventTypes: MatchEventType[] = ['goal', 'assist', 'key_pass', 'yellow_card', 'red_card', 'substitution', 'penalty', 'goalkeeper_save'];
const label = (value: string) => value.replaceAll('_', ' ');
const inputClass = 'w-full rounded-md border border-border-default bg-surface-elevated p-2 text-sm text-foreground';

export function MatchAmendmentPanel({ match, report, events, squad, onClose }: {
  match: MatchRecord; report: SessionReport; events: MatchLogEvent[]; squad: MatchSquadAthlete[]; onClose: () => void;
}) {
  const { team } = useAuth();
  const queryClient = useQueryClient();
  const [draftRevision] = useState(report.reportRevision);
  const [rows, setRows] = useState<Amendment[]>([]);
  const [action, setAction] = useState<'add' | 'correct' | 'void'>('correct');
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const selected = events.find(event => event.id === eventId);
  const [eventType, setEventType] = useState<MatchEventType>(selected?.eventType ?? 'goal');
  const [minute, setMinute] = useState(selected?.minute ?? 0);
  const [side, setSide] = useState<'own' | 'opponent'>('own');
  const [athleteId, setAthleteId] = useState('');
  const [opponentLabel, setOpponentLabel] = useState('');
  const [incomingId, setIncomingId] = useState('');
  const [reason, setReason] = useState('');
  const [responseReasons, setResponseReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownSide = match.isHome ? 'home' : 'away';
  const name = (side: 'home' | 'away') => report.participants.find(participant => participant.side === side)?.teamName ?? side;
  const load = () => apiFetch<Amendment[]>(`/matches/${match.id}/amendments`).then(setRows);
  useEffect(() => {
    let active = true;
    const refresh = () => apiFetch<Amendment[]>(`/matches/${match.id}/amendments`)
      .then(value => { if (active) setRows(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load amendments.'); });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [match.id]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null); setNote(null);
    try {
      await operation(); await load();
      await queryClient.invalidateQueries({ queryKey: ['match-sessions', report.sessionId] });
      await queryClient.invalidateQueries({ queryKey: ['matches'] });
      await queryClient.invalidateQueries({ queryKey: ['statistics'] });
      await queryClient.invalidateQueries({ queryKey: ['shared-competitions'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the amendment.'); }
    finally { setBusy(false); }
  };
  const submit = () => run(async () => {
    if (draftRevision !== report.reportRevision) throw new Error('The report changed. Close and reopen amendments to review the latest version.');
    if (reason.trim().length < 3) throw new Error('Explain the proposed change.');
    if (action !== 'add' && !selected) throw new Error('Select an event to change.');
    const replacement = action === 'add' ? {
      clientRequestId: crypto.randomUUID(), team: side, eventType, minute,
      ...(side === 'own' ? { athleteId: athleteId || null } : { opponentLabel: opponentLabel.trim() || 'Unassigned' }),
      ...(eventType === 'substitution' ? { detail: side === 'own' ? incomingId : opponentLabel.trim() } : {}),
    } : { eventType, minute };
    await apiFetch(`/matches/${match.id}/amendments`, { method: 'POST', body: JSON.stringify({
      id: crypto.randomUUID(), expectedSessionRevision: draftRevision, action, reason: reason.trim(),
      ...(action !== 'add' ? { canonicalEventId: eventId } : {}),
      ...(action !== 'void' ? { replacement } : {}),
    }) });
    setReason(''); setNote('Amendment proposed. The official report stays unchanged until both teams approve.');
  });
  const respond = (row: Amendment, response: string) => run(async () => {
    const result = await apiFetch<{ status: string }>(`/matches/${match.id}/amendments/${row.id}/respond`, {
      method: 'POST', body: JSON.stringify({ response, reason: responseReasons[row.id]?.trim() || undefined }),
    });
    setNote(result.status === 'accepted' ? 'Both teams approved. The amended report is now official.'
      : result.status === 'stale' ? 'The report changed. Submit a fresh proposal after reviewing it.'
      : response === 'approve' ? 'Your team approved. Waiting for the other team.' : `Amendment ${label(result.status)}.`);
  });
  const copy = (event: Amendment['before']) => event ? `${event.minute}' ${label(event.eventType)}${event.playerLabel ? ` · ${event.playerLabel}` : ''}` : 'No event';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="amendment-title">
    <section className="themed-scrollbar max-h-[85dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-border-default bg-popover p-5 text-popover-foreground shadow-2xl">
      <div className="flex items-center justify-between gap-3"><h2 id="amendment-title" className="font-oswald text-xl">Report amendments</h2><button type="button" onClick={onClose}>Close</button></div>
      <p className="text-sm text-muted-foreground">The confirmed score and timeline stay official while proposals are reviewed. Both teams must approve each change.</p>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {note ? <p role="status" className="text-sm text-primary">{note}</p> : null}
      {team?.role === 'coach' ? <form className="space-y-3 rounded-xl border border-border-default p-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h3 className="font-semibold">Request amendment</h3>
        <label className="block text-sm">Change<select className={inputClass} value={action} onChange={event => setAction(event.target.value as typeof action)}><option value="correct">Correct an event</option><option value="add">Add a missed event</option><option value="void">Remove an event</option></select></label>
        {action !== 'add' ? <label className="block text-sm">Event<select className={inputClass} value={eventId} onChange={event => {
          setEventId(event.target.value); const selected = events.find(row => row.id === event.target.value);
          if (selected) { setEventType(selected.eventType); setMinute(selected.minute); }
        }}>{events.map(event => <option key={event.id} value={event.id}>{event.minute}' {label(event.eventType)} · {event.team === 'own' ? name(ownSide) : name(ownSide === 'home' ? 'away' : 'home')} · {event.athlete ? `${event.athlete.firstName} ${event.athlete.lastName}` : event.opponentLabel ?? 'Unassigned'}</option>)}</select></label> : <label className="block text-sm">Team<select className={inputClass} value={side} onChange={event => setSide(event.target.value as typeof side)}><option value="own">{name(ownSide)}</option><option value="opponent">{name(ownSide === 'home' ? 'away' : 'home')}</option></select></label>}
        {action !== 'void' ? <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Event type<select className={inputClass} value={eventType} onChange={event => setEventType(event.target.value as MatchEventType)}>{[...new Set([...eventTypes, ...(action === 'correct' && selected ? [selected.eventType] : [])])].map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label>
          <label className="text-sm">Minute<input className={inputClass} type="number" min={0} max={150} required value={minute} onChange={event => setMinute(Number(event.target.value))} /></label>
        </div> : null}
        {action === 'add' && side === 'own' ? <label className="block text-sm">Player<select className={inputClass} value={athleteId} onChange={event => setAthleteId(event.target.value)} required><option value="">Select player</option>{squad.map(player => <option key={player.id} value={player.id}>{player.firstName} {player.lastName}</option>)}</select></label> : null}
        {action === 'add' && side === 'opponent' ? <label className="block text-sm">Public player name or shirt number<input className={inputClass} maxLength={50} value={opponentLabel} onChange={event => setOpponentLabel(event.target.value)} /></label> : null}
        {action === 'add' && side === 'own' && eventType === 'substitution' ? <label className="block text-sm">Incoming player<select className={inputClass} required value={incomingId} onChange={event => setIncomingId(event.target.value)}><option value="">Select player</option>{squad.map(player => <option key={player.id} value={player.id}>{player.firstName} {player.lastName}</option>)}</select></label> : null}
        <label className="block text-sm">Reason<textarea className={inputClass} required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={busy || !navigator.onLine}>Propose change</button>
        {!navigator.onLine ? <p className="text-xs text-warning">Connect to submit or approve amendments.</p> : null}
      </form> : null}
      <h3 className="font-semibold">Proposals and history</h3>
      {!rows.length ? <p className="text-sm text-muted-foreground">No amendments requested.</p> : null}
      {rows.map(row => <article key={row.id} className="space-y-2 rounded-xl border border-border-default p-3 text-sm">
        <p className="font-semibold">{report.participants.find(participant => participant.teamId === row.proposedByTeamId)?.teamName ?? 'Team'} · {label(row.status)}</p>
        <p>{row.reason}</p><p className="text-xs text-muted-foreground">Before: {copy(row.before)}<br />Proposed: {copy(row.after)}</p>
        {row.status === 'pending' ? <p>Score if accepted: {name('home')} {row.proposedScore.home}–{row.proposedScore.away} {name('away')}</p> : null}
        <p className="text-xs">{name('home')}: {row.approvals.home ? 'approved' : 'awaiting approval'} · {name('away')}: {row.approvals.away ? 'approved' : 'awaiting approval'}</p>
        {row.responseReason ? <p className="text-xs text-warning">Response: {row.responseReason}</p> : null}
        {row.status === 'stale' ? <p className="text-xs text-warning">Another amendment changed the report. Review it and submit a new proposal.</p> : null}
        {row.status === 'changes_requested' ? <p className="text-xs text-warning">Use the form above to submit a revised proposal with a new reason.</p> : null}
        {row.status === 'pending' && team?.role === 'coach' ? <div className="space-y-2">
          <label className="block text-xs">Explanation for rejection or requested changes<textarea className={inputClass} maxLength={500} value={responseReasons[row.id] ?? ''} onChange={event => setResponseReasons({ ...responseReasons, [row.id]: event.target.value })} /></label>
          <div className="flex flex-wrap gap-2">{!row.approvals[ownSide] ? <button disabled={busy || !navigator.onLine} className="rounded border border-primary px-2 py-1 text-primary" onClick={() => void respond(row, 'approve')}>Approve change</button> : <span className="text-xs text-muted-foreground">Your team approved</span>}
            <button disabled={busy || !navigator.onLine} className="rounded border px-2 py-1" onClick={() => void respond(row, 'request_changes')}>Request changes</button>
            <button disabled={busy || !navigator.onLine} className="rounded border px-2 py-1" onClick={() => void respond(row, 'reject')}>Reject</button>
            {row.proposedByTeamId === team.id ? <button disabled={busy || !navigator.onLine} className="rounded border px-2 py-1" onClick={() => void respond(row, 'withdraw')}>Withdraw</button> : null}
          </div>
        </div> : null}
      </article>)}
    </section>
  </div>;
}
