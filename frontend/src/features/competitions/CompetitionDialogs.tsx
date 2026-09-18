import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompetitionMutation } from "./hooks";
import { createCompetition, updateCompetition } from "./api";
import type { CompetitionDetail, CompetitionInput } from "./types";

export function RequestError({ error }: { error: Error | null }) {
  return error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null;
}

function Modal({ title, description, busy, onClose, children }: {
  title: string; description: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent showCloseButton={!busy} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function CompetitionFormDialog({ competition, onClose, onSaved }: {
  competition?: CompetitionDetail; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(competition?.name ?? "");
  const [type, setType] = useState<CompetitionInput["type"]>(competition?.type === "cup" ? "cup" : "league");
  const [season, setSeason] = useState(competition?.season ?? "");
  const save = useCompetitionMutation((input: CompetitionInput) => competition
    ? updateCompetition(competition.id, input) : createCompetition(input));
  return (
    <Modal title={competition ? "Edit competition" : "Create a League or Competition"}
      description={competition ? "Update the competition details." : "You become the admin and your team participates automatically."}
      busy={save.isPending} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ name: name.trim(), type, season: season.trim() }, { onSuccess: (result) => onSaved(result.id) });
      }}>
        <fieldset disabled={save.isPending} className="space-y-4">
          <label className="grid gap-2 text-sm">Competition name<input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid gap-2 text-sm"><label htmlFor="competition-type">Type</label>
            <Select value={type} onValueChange={(value) => { if (value === "league" || value === "cup") setType(value); }}>
              <SelectTrigger id="competition-type" className="w-full"><SelectValue>{type === "league" ? "League" : "Cup"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="league">League</SelectItem><SelectItem value="cup">Cup</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="grid gap-2 text-sm">Season (optional)<input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" maxLength={20} placeholder="e.g. 2026/27" value={season} onChange={(e) => setSeason(e.target.value)} /></label>
        </fieldset>
        <RequestError error={save.error} />
        <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !name.trim()}>{save.isPending ? "Saving..." : competition ? "Save changes" : "Create competition"}</Button></DialogFooter>
      </form>
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
        {config.label && <label className="grid gap-2 text-sm">{config.label}<input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" autoFocus required
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
