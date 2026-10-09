import { useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { CompetitionMatchEventGraphic, getCompetitionMatchEventAppearance } from "./CompetitionMatchEventGraphic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchCompetitionMatchCentre, type CompetitionMatchCentreData } from "./api";

export function CompetitionMatchCentre({ competitionId, fixtureId, home, away, homeTeamId, awayTeamId, onClose }: {
  competitionId: string; fixtureId: string; home: string; away: string; homeTeamId: string | null; awayTeamId: string | null; onClose: () => void;
}) {
  const [data, setData] = useState<CompetitionMatchCentreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchCompetitionMatchCentre(competitionId, fixtureId)
      .then((result) => { if (active) setData(result); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Could not load this report."); });
    return () => { active = false; };
  }, [competitionId, fixtureId]);

  const printReport = () => {
    if (!data) return;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character] ?? character);
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.opener = null;
    const body = data.events.map((event) => `<tr><td>${event.minute}′</td><td>${escapeHtml(getCompetitionMatchEventAppearance(event.type).label)}</td><td>${escapeHtml(event.playerName)}</td><td>${escapeHtml(event.teamId === homeTeamId ? home : event.teamId === awayTeamId ? away : "Unknown team")}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Match Report</title><style>body{font:14px Arial,sans-serif;margin:36px;color:#111}h1{font-size:24px}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}p{color:#555}</style></head><body><h1>${escapeHtml(home)} ${data.homeScore ?? "–"} – ${data.awayScore ?? "–"} ${escapeHtml(away)}</h1><p>Finalized competition match · shared event report</p><table><thead><tr><th>Minute</th><th>Event</th><th>Player</th><th>Team</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-y-auto p-5 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="size-5" />Match Centre</DialogTitle>
            <DialogDescription>Finalized competition match · shared match events only</DialogDescription>
          </DialogHeader>
          <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border bg-muted/30 p-4 text-center">
            <div className="font-semibold">{home}</div>
            <div className="text-2xl font-bold tabular-nums">{data ? `${data.homeScore ?? "–"} – ${data.awayScore ?? "–"}` : "–"}</div>
            <div className="font-semibold">{away}</div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!data && !error && <p className="text-sm text-muted-foreground">Loading finalized events…</p>}
          {data && <>
            <h3 className="mb-3 font-semibold">Match timeline</h3>
            {!data.hasReport && <p className="text-sm text-muted-foreground">No live-logged event report is available for this result.</p>}
            <div className="space-y-2">
              {data.events.map((event) => <div key={event.id} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/70 p-3 text-sm transition-colors hover:bg-muted/40">
                <span className="w-9 shrink-0 text-center font-semibold tabular-nums text-muted-foreground">{event.minute}′</span>
                <CompetitionMatchEventGraphic type={event.type} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{getCompetitionMatchEventAppearance(event.type).label}</div>
                  <div className="break-words text-muted-foreground">{event.playerName}</div>
                </div>
                <span className="max-w-24 shrink-0 text-right text-xs text-muted-foreground sm:max-w-36">{event.teamId === homeTeamId ? home : event.teamId === awayTeamId ? away : "Unknown team"}</span>
              </div>)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">This view excludes private team tactics, medical details and internal notes.</p>
          </>}
          <div className="mt-5 flex justify-end gap-2 print:hidden">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button disabled={!data?.hasReport} onClick={printReport}><Printer className="size-4" />Print / Save PDF</Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}
