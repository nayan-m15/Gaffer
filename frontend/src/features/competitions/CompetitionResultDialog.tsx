import { useMemo, useState, type FormEvent } from "react";
import { AnimatedModalContent } from "@/components/ui/animated-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { createCompetitionResult, updateCompetitionResult } from "./api";
import { useCompetitionMutation } from "./hooks";
import type {
  CompetitionResult,
  CompetitionResultInput,
  Participant,
} from "./types";

const inputClassName =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

function toLocalDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CompetitionResultDialog({
  competitionId,
  participants,
  result,
  onClose,
}: {
  competitionId: string;
  participants: Participant[];
  result?: CompetitionResult;
  onClose: () => void;
}) {
  const [homeId, setHomeId] = useState(
    result?.homeCompetitionTeamId ?? participants[0]?.id ?? "",
  );
  const [awayId, setAwayId] = useState(
    result?.awayCompetitionTeamId ?? participants[1]?.id ?? "",
  );
  const [homeScore, setHomeScore] = useState(String(result?.homeScore ?? 0));
  const [awayScore, setAwayScore] = useState(String(result?.awayScore ?? 0));
  const [playedAt, setPlayedAt] = useState(toLocalDateTime(result?.playedAt));
  const [error, setError] = useState<string | null>(null);

  const mutation = useCompetitionMutation<CompetitionResultInput, CompetitionResult>(
    (input) =>
      result
        ? updateCompetitionResult(competitionId, result.id, input)
        : createCompetitionResult(competitionId, input),
  );

  const canSubmit = useMemo(() => {
    const home = Number(homeScore);
    const away = Number(awayScore);
    return (
      homeId.length > 0 &&
      awayId.length > 0 &&
      homeId !== awayId &&
      Number.isInteger(home) &&
      Number.isInteger(away) &&
      home >= 0 &&
      away >= 0 &&
      home <= 99 &&
      away <= 99 &&
      playedAt.length > 0
    );
  }, [awayId, awayScore, homeId, homeScore, playedAt]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await mutation.mutateAsync({
        homeCompetitionTeamId: homeId,
        awayCompetitionTeamId: awayId,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        playedAt: new Date(playedAt).toISOString(),
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save this competition result.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <AnimatedModalContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{result ? "Edit result" : "Record result"}</DialogTitle>
          <DialogDescription>
            Use this for a competition match that was not completed through the live logger.
            The standings will update automatically.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Home team
              <select
                className={inputClassName}
                value={homeId}
                onChange={(event) => setHomeId(event.target.value)}
              >
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Away team
              <select
                className={inputClassName}
                value={awayId}
                onChange={(event) => setAwayId(event.target.value)}
              >
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Home score
              <input
                className={inputClassName}
                type="number"
                min={0}
                max={99}
                step={1}
                value={homeScore}
                onChange={(event) => setHomeScore(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Away score
              <input
                className={inputClassName}
                type="number"
                min={0}
                max={99}
                step={1}
                value={awayScore}
                onChange={(event) => setAwayScore(event.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Played at
            <input
              className={inputClassName}
              type="datetime-local"
              value={playedAt}
              onChange={(event) => setPlayedAt(event.target.value)}
            />
          </label>
          {homeId === awayId && (
            <p className="text-sm text-destructive">Choose two different teams.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? "Saving…" : result ? "Save result" : "Record result"}
            </Button>
          </div>
        </form>
      </AnimatedModalContent>
    </Dialog>
  );
}
