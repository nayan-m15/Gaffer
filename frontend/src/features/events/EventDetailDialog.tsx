import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedModalContent } from "@/components/ui/animated-modal";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { searchLocations } from "./api";
import {
  buildEventDestination,
  buildEventMapUrl,
  displayEventStatus,
  eventStatusLabel,
  eventTypeLabel,
  formatEventDateTime,
  getEventMapTiles,
} from "./event-utils";
import { useCancelEvent } from "./hooks";
import type { EventStatus, TeamEvent } from "./types";
import { fetchEventRsvps, type AthleteRsvp } from "@/services/rsvps";
import type { PlayerEvent } from "@/services/player";
import { RsvpWidget } from "@/features/player/RsvpWidget";
import { EventWeatherCard } from "./EventWeatherCard";

interface EventDetailDialogProps {
  event: TeamEvent | PlayerEvent | null;
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: TeamEvent) => void;
  /**
   * Player mode: hides Edit/Cancel/Confirm-squad and skips the coach-only
   * RSVP breakdown fetch (GET /events/:eventId/rsvps 403s for a player),
   * showing the player's own RsvpWidget instead. `rsvpQueryKey` is required
   * in this mode so the widget can invalidate the right query on submit.
   */
  readOnly?: boolean;
  rsvpQueryKey?: readonly string[];
  /**
   * Assistant mode: hides the coach-only Edit/Cancel actions while keeping
   * the RSVP breakdown and match navigation. The
   * backend independently enforces 403 on event mutations.
   */
  canManage?: boolean;
}

function friendlyFixtureMessage(
  status: string | null | undefined,
  requester: boolean | null,
  opponentName: string,
  lineupConfirmed: boolean,
) {
  if (status === "accepted") {
    const lineup = lineupConfirmed ? " Your team's lineup is confirmed and visible to them." : "";
    return `Friendly fixture confirmed with ${opponentName}. The match appears on both teams' calendars.${lineup}`;
  }
  if (status === "pending") {
    if (requester === false) return `${opponentName} has invited your team to a friendly fixture — accept or decline it from the requests banner on your Events page.`;
    if (requester === true) return `Friendly fixture request sent to ${opponentName} — waiting for them to accept.`;
    return `A friendly fixture request with ${opponentName} is awaiting a response.`;
  }
  if (status === "declined") {
    const guidance = " Edit the event to pick another opponent, or play a team without a Gaffer account.";
    if (requester === false) return `You declined this friendly fixture against ${opponentName}.${guidance}`;
    if (requester === true) return `${opponentName} declined this friendly fixture.${guidance}`;
    return `This friendly fixture with ${opponentName} was declined.${guidance}`;
  }
  if (status === "cancelled") return `This friendly fixture with ${opponentName} has been cancelled.`;
  return "";
}

function friendlyFixtureClass(status: string | null | undefined) {
  switch (status) {
    case "accepted": return "border-emerald-500/25 bg-emerald-500/10 text-emerald-500";
    case "pending": return "border-amber-500/25 bg-amber-500/10 text-amber-500";
    case "declined": return "border-destructive/25 bg-destructive/10 text-destructive";
    case "cancelled": return "border-border bg-muted/40 text-muted-foreground";
    default: return "";
  }
}

export function EventDetailDialog({
  event, now, open, onOpenChange, onEdit, readOnly = false, rsvpQueryKey, canManage = true,
}: EventDetailDialogProps) {
  const navigate = useNavigate();
  const cancelEvent = useCancelEvent();
  const [error, setError] = useState<string | null>(null);

  const rsvpsQuery = useQuery({
    queryKey: ["events", event?.id, "rsvps"],
    queryFn: () => fetchEventRsvps(event!.id),
    enabled: open && Boolean(event?.id) && !readOnly, // ← the key change
  });

  const rsvpGroups = useMemo(() => {
    const athletes = rsvpsQuery.data ?? [];
    const groups: Record<"confirmed" | "maybe" | "declined" | "no_response", AthleteRsvp[]> = {
      confirmed: [], maybe: [], declined: [], no_response: [],
    };
    for (const a of athletes) {
      if (a.rsvpStatus === "going") groups.confirmed.push(a);
      else if (a.rsvpStatus === "maybe") groups.maybe.push(a);
      else if (a.rsvpStatus === "not_going") groups.declined.push(a);
      else groups.no_response.push(a);
    }
    return groups;
  }, [rsvpsQuery.data]);

  const handleCancel = async () => {
    if (!event) return;
    setError(null);
    try {
      await cancelEvent.mutateAsync(event.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this event. Please try again.");
    }
  };

  const playerEvent = readOnly ? (event as PlayerEvent | null) : null;
  const generatedFixture = Boolean(event?.competitionFixtureId);
  const fixtureDateConfirmed =
    !generatedFixture || Boolean(event?.fixtureScheduleConfirmedAt);
  // A manual match against another Gaffer team only counts as confirmed for
  // this team once the opponent accepted the friendly-fixture request.
  const friendlyFixtureLinked = Boolean(event?.friendlyFixtureStatus);
  // The backend resolves the opponent per side, so it is always the *other*
  // team; fall back to the event title if a response ever violates that.
  const friendlyOpponentIsSelf = Boolean(
    event?.friendlyOpponentTeamId && event.friendlyOpponentTeamId === event.teamId,
  );
  const friendlyOpponentName = friendlyOpponentIsSelf
    ? event?.title ?? "the opponent"
    : event?.friendlyOpponentTeamName ?? event?.title ?? "the opponent";
  // Which side of the fixture is viewing: the requester's calendar or the
  // recipient's. Null when an older response omits the requester marker.
  const viewerIsRequester = event?.friendlyRequesterTeamId
    ? event.friendlyRequesterTeamId === event.teamId
    : null;
  const friendlyFixtureConfirmed =
    !friendlyFixtureLinked || event?.friendlyFixtureStatus === "accepted";
  const canConfirmSquad = fixtureDateConfirmed && friendlyFixtureConfirmed;
  const friendlyStatusMessage = friendlyFixtureMessage(
    event?.friendlyFixtureStatus,
    viewerIsRequester,
    friendlyOpponentName,
    Boolean(event?.lineupConfirmedAt),
  );
  const reportableMatch = event?.type === "match" && event.status === "completed" && Boolean(event.matchId);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setError(null); onOpenChange(nextOpen); }}>
      <AnimatedModalContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold uppercase tracking-wide text-foreground">Event</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {readOnly
              ? "Event details and your RSVP."
              : canManage
                ? "Review this event, edit it, or cancel it on the calendar."
                : "View this event's details and RSVP responses."}
          </DialogDescription>
        </DialogHeader>

        {event && (
          <div className={cn("space-y-4 rounded-lg border border-border bg-background p-4", event.status === "cancelled" && "opacity-70")}>
            <div className="flex items-start justify-between gap-3">
              <h3 className={cn("text-xl font-semibold text-foreground", event.status === "cancelled" && "line-through")}>
                {event.title}
              </h3>
              <StatusBadge status={displayEventStatus(event, now)} />
            </div>
            <DetailRow label="Type" value={eventTypeLabel(event.type)} />
            <DetailRow label="Date & time" value={formatEventDateTime(event.scheduledAt, event.weatherTimezone)} />
            <EventLocationSection event={event} />
            <DetailRow label="Notes" value={event.notes?.trim() ? event.notes : "None"} />
            {generatedFixture && event.status === "scheduled" && (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  fixtureDateConfirmed
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-500",
                )}
              >
                {fixtureDateConfirmed
                  ? "Fixture date confirmed by both teams."
                  : "This generated fixture date is provisional. Coaches manage confirmation and rescheduling from Leagues & Competitions."}
              </div>
            )}
            {friendlyFixtureLinked && event.status === "scheduled" && (
              <div
                className={cn("rounded-lg border px-3 py-2 text-sm", friendlyFixtureClass(event.friendlyFixtureStatus))}
              >
                {friendlyStatusMessage}
              </div>
            )}
            {event.status !== "cancelled" && !readOnly && (
              <EventWeatherCard event={event} enabled={open} />
            )}
          </div>
        )}

        {/* Player RSVP — replaces the coach breakdown entirely */}
        {readOnly && event && playerEvent && rsvpQueryKey && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Your RSVP
            </h3>
            <RsvpWidget
              key={event.id}
              eventId={event.id}
              scheduledAt={event.scheduledAt}
              eventStatus={event.status}
              currentStatus={playerEvent.rsvpStatus}
              currentNote={playerEvent.rsvpNote}
              queryKey={rsvpQueryKey}
            />
          </div>
        )}

        {/* Coach breakdown — unchanged, just gated on !readOnly */}
        {!readOnly && event && rsvpsQuery.data && rsvpsQuery.data.length > 0 && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              RSVP Responses ({rsvpsQuery.data.length})
            </h3>
            <div className="space-y-3">
              <RsvpGroup label="Confirmed" athletes={rsvpGroups.confirmed} dotClass="bg-emerald-400" />
              <RsvpGroup label="Maybe" athletes={rsvpGroups.maybe} dotClass="bg-amber-400" />
              <RsvpGroup label="Declined" athletes={rsvpGroups.declined} dotClass="bg-red-400" />
              <RsvpGroup label="No response" athletes={rsvpGroups.no_response} dotClass="bg-muted-foreground/40" />
            </div>
          </div>
        )}

        {!readOnly && event && rsvpsQuery.isLoading && (
          <div className="rounded-lg border border-border bg-background p-4 text-center text-xs text-muted-foreground">
            Loading RSVP responses…
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {!readOnly && (
          <DialogFooter className="gap-2 sm:justify-between">
            {canManage && event && event.status !== "cancelled" && !generatedFixture && (
              <Button variant="destructive" onClick={() => void handleCancel()} disabled={cancelEvent.isPending}>
                {cancelEvent.isPending ? "Cancelling…" : "Cancel Event"}
              </Button>
            )}
            {event && event.type === "match" && (event.status === "scheduled" || reportableMatch) && (
              <Button
                disabled={!reportableMatch && !canConfirmSquad}
                onClick={() => navigate(reportableMatch ? `/matches/${event.matchId}/report` : `/events/${event.id}/confirm-squad`)}
              >
                {reportableMatch ? "View Match Report" : canConfirmSquad ? "Confirm squad" : "Awaiting fixture confirmation"}
              </Button>
            )}
            {canManage && event && !generatedFixture && (
              <Button variant="outline" className="sm:ml-auto" onClick={() => onEdit(event as TeamEvent)}>Edit</Button>
            )}
          </DialogFooter>
        )}
      </AnimatedModalContent>
    </Dialog>
  );
}

function EventLocationSection({ event }: { event: TeamEvent | PlayerEvent }) {
  const destination = buildEventDestination(event);
  if (!destination) {
    return <DetailRow label="Location" value="Not set" />;
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-4">
        <DetailRow label="Location" value={event.location || "Not set"} />
        {event.venueName && <DetailRow label="Venue" value={event.venueName} />}
        {event.venueAddress && <DetailRow label="Address" value={event.venueAddress} />}
        <LocationLinks event={event} />
      </div>
      <EventLocationMapSquare event={event} destination={destination} />
    </div>
  );
}

function LocationLinks({ event }: { event: TeamEvent | PlayerEvent }) {
  const destination = buildEventDestination(event);
  if (!destination) {
    return null;
  }
  const encoded = encodeURIComponent(destination);
  return (
    <div className="flex gap-3 text-xs">
      <a
        className="font-medium text-primary hover:underline"
        href={buildEventMapUrl(destination)}
        target="_blank"
        rel="noreferrer"
      >
        View map
      </a>
      <a
        className="font-medium text-primary hover:underline"
        href={`https://www.google.com/maps/dir/?api=1&destination=${encoded}`}
        target="_blank"
        rel="noreferrer"
      >
        Get directions
      </a>
    </div>
  );
}

function EventLocationMapSquare({
  event,
  destination,
}: {
  event: TeamEvent | PlayerEvent;
  destination: string;
}) {
  const mapUrl = buildEventMapUrl(destination);

  const hasEventCoords =
    event.weatherLatitude != null && event.weatherLongitude != null;

  // Fallback to searching coordinates by location if missing
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["locations", "search", event.location],
    queryFn: () => searchLocations(event.location),
    enabled:
      !hasEventCoords &&
      Boolean(event.location && event.location.trim().length >= 3),
    staleTime: 1000 * 60 * 60 * 24,
  });

  const latitude = hasEventCoords
    ? event.weatherLatitude
    : searchResults?.[0]?.latitude ?? null;
  const longitude = hasEventCoords
    ? event.weatherLongitude
    : searchResults?.[0]?.longitude ?? null;

  const [tileError, setTileError] = useState(false);

  const tiles = useMemo(() => {
    if (latitude == null || longitude == null || tileError) return null;
    return getEventMapTiles(latitude, longitude, 15, 128, 128);
  }, [latitude, longitude, tileError]);

  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${destination} in Google Maps`}
      aria-label={`Open ${destination} in Google Maps`}
      className="group relative flex size-28 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 shadow-xs transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:size-32"
    >
      {tiles ? (
        <>
          {/* Direct OpenStreetMap tiles without iframe clutter */}
          <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            {tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.url}
                alt=""
                onError={() => setTileError(true)}
                className="absolute size-[256px] max-w-none select-none"
                style={{
                  left: `${tile.left}px`,
                  top: `${tile.top}px`,
                }}
                loading="lazy"
                draggable={false}
              />
            ))}
          </div>

          {/* Centered green map pin */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-md">
            <svg
              viewBox="0 0 24 36"
              className="h-7 w-auto"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z"
                fill="#84cc16"
              />
              <circle cx="12" cy="12" r="4.5" fill="#ffffff" />
            </svg>
          </div>

          {/* Clean minimal OSM attribution badge */}
          <span className="pointer-events-none absolute bottom-0.5 right-1 z-10 rounded bg-background/80 px-1 py-0.5 text-[8px] font-medium text-muted-foreground/80 backdrop-blur-xs">
            © OSM
          </span>
        </>
      ) : (
        <div className="relative flex size-full flex-col items-center justify-center bg-muted/30 p-2 text-center">
          <div className="relative mb-1 flex items-center justify-center">
            <span className="absolute inline-flex size-7 animate-ping rounded-full bg-primary/20 opacity-75" />
            <div className="relative flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-4.5" />
            </div>
          </div>
          <span className="line-clamp-1 max-w-full text-[10px] font-medium text-foreground">
            {event.venueName || event.location}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {isSearching ? "Finding location…" : "Open map"}
          </span>
        </div>
      )}

      {/* Floating hover badge */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/0 p-1 transition-colors duration-200 group-hover:bg-black/40">
        <div className="flex items-center gap-1 rounded bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span>View map</span>
          <ExternalLink className="size-3 text-primary" />
        </div>
      </div>
    </a>
  );
}

// DetailRow, StatusBadge, RsvpGroup — unchanged, keep as-is.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        status === "scheduled" && "bg-primary/10 text-primary",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "cancelled" &&
          "bg-destructive/10 text-destructive line-through",
      )}
    >
      {eventStatusLabel(status)}
    </span>
  );
}

/* ── RSVP breakdown sub-components ──────────────────────────────────────── */

function RsvpGroup({
  label,
  athletes,
  dotClass,
}: {
  label: string;
  athletes: AthleteRsvp[];
  dotClass: string;
}) {
  if (athletes.length === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", dotClass)} />
        <span className="text-xs font-semibold text-foreground">
          {label} ({athletes.length})
        </span>
      </div>
      <ul className="space-y-1 pl-3.5">
        {athletes.map((a) => (
          <li key={a.id} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {a.firstName} {a.lastName}
            </span>
            {a.squadNumber != null && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                #{a.squadNumber}
              </span>
            )}
            {a.rsvpNote && (
              <span className="ml-1 italic">“{a.rsvpNote}”</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
