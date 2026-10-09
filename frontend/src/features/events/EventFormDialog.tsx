import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarIcon, Check, ClockIcon, Search, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatefulButton } from "@/components/ui/stateful-button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedModalContent } from "@/components/ui/animated-modal";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCompetitions } from "@/features/statistics/hooks";
import type { CompetitionWithStandings } from "@/features/statistics/types";
import {
  EVENT_TYPE_OPTIONS,
  combineScheduledAt,
  formatDateLabel,
  formatLocalDate,
  formatTimeLabel,
  isScheduleInThePast,
  parseLocalDate,
  splitScheduledAt,
  startOfLocalDay,
} from "./event-utils";
import { useCreateEvent, useUpdateEvent } from "./hooks";
import { reverseSearchLocation, searchLocations } from "./api";
import type {
  CreateEventInput,
  EventType,
  FriendlyFixtureStatus,
  LocationSearchResult,
  TeamEvent,
  UpdateEventInput,
} from "./types";
import { searchGafferTeams } from "@/services/teams";
import type { GafferTeamSearchResult } from "@/services/teams";
import { getEventTypeStyle } from "./event-style";

const inputClassName =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

const TIME_HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const TIME_MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

/** Match first so the type segments follow the calendar's visual grouping. */
const FORM_EVENT_TYPE_ORDER: EventType[] = ["match", "training", "meeting"];

function competitionOptionLabel(competition: CompetitionWithStandings) {
  const name = competition.name.trim() || "Unnamed competition";
  return competition.season ? `${name} (${competition.season})` : name;
}

function opponentSuggestionsFromStandings(
  competitions: CompetitionWithStandings[] | undefined,
  selectedCompetitionId: string,
) {
  if (selectedCompetitionId === "none") {
    return [];
  }
  const competition = competitions?.find(
    (entry) => entry.id === selectedCompetitionId,
  );
  if (!competition) {
    return [];
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const standing of competition.standings) {
    if (standing.isOwnTeam) {
      continue;
    }
    const name = standing.teamName.trim();
    if (!name || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

type EventFormValues = {
  title: string;
  type: EventType;
  scheduledAt: string;
  location: string;
  venueName: string;
  venueAddress: string;
  forecastLocation: LocationSearchResult | null;
  notes: string;
  competitionId: string;
  opponentTeamId: string | null;
  friendlyPlayersPerSide: 5 | 7 | 11;
};

function commonEventInput(values: EventFormValues) {
  return {
    title: values.title.trim(),
    type: values.type,
    scheduledAt: values.scheduledAt,
    location: values.location.trim(),
    venueName: values.venueName.trim() || null,
    venueAddress: values.venueAddress.trim() || null,
    weatherLocation: values.forecastLocation?.displayName ?? null,
    weatherLatitude: values.forecastLocation?.latitude ?? null,
    weatherLongitude: values.forecastLocation?.longitude ?? null,
    weatherTimezone: values.forecastLocation?.timezone ?? null,
    competitionId:
      values.type === "match" && values.competitionId !== "none"
        ? values.competitionId
        : null,
    friendlyPlayersPerSide: values.type === 'match' && values.competitionId === 'none' ? values.friendlyPlayersPerSide : undefined,
    friendlyOpponentTeamId:
      values.type === "match" && values.competitionId === "none"
        ? values.opponentTeamId
        : null,
  };
}

function createEventInput(values: EventFormValues): CreateEventInput {
  return {
    ...commonEventInput(values),
    ...(values.notes.length > 0 ? { notes: values.notes } : {}),
  };
}

function updateEventInput(
  values: EventFormValues,
  friendlyFixtureLocked: boolean,
): UpdateEventInput {
  const input = commonEventInput(values);
  return {
    ...input,
    notes: values.notes.length > 0 ? values.notes : null,
    ...(friendlyFixtureLocked
      ? {}
      : { friendlyOpponentTeamId: input.friendlyOpponentTeamId }),
  };
}

function eventScheduleError(
  scheduledAt: string,
  isEditing: boolean,
): string | undefined {
  const timestamp = new Date(scheduledAt).getTime();
  if (Number.isNaN(timestamp)) return "Enter a valid date and time.";
  if (!isEditing && timestamp <= Date.now()) {
    return "Choose a date and time in the future.";
  }
  return undefined;
}

interface EventFormDialogProps {
  open: boolean;
  event?: TeamEvent;
  /** Date prefilled when creating from a calendar day click. */
  initialDate?: Date;
  /** Event type prefilled when creating from a calendar menu action. */
  initialType?: EventType;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create / edit event form. Visual style follows the command-centre cards
 * (uppercase labels, dark inputs, full-width primary action) without the
 * match-only logger fields.
 */
export function EventFormDialog({
  open,
  event,
  initialDate,
  initialType,
  onOpenChange,
}: EventFormDialogProps) {
  const isEditing = Boolean(event);
  const baseId = useId();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const competitionsQuery = useCompetitions();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("training");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [selectedVenueLocation, setSelectedVenueLocation] = useState<LocationSearchResult | null>(null);
  const [venueResults, setVenueResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingVenue, setIsSearchingVenue] = useState(false);
  const [venueSearchCompleted, setVenueSearchCompleted] = useState(false);
  const [venueSearchEnabled, setVenueSearchEnabled] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState("");
  const [competitionId, setCompetitionId] = useState("none");
  const [friendlyPlayersPerSide, setFriendlyPlayersPerSide] = useState<5 | 7 | 11>(11);
  const [opponentPick, setOpponentPick] = useState("");
  const [gafferOpponentPick, setGafferOpponentPick] =
    useState<GafferTeamSearchResult | null>(null);
  const [gafferOpponentQuery, setGafferOpponentQuery] = useState("");
  const [gafferOpponentResults, setGafferOpponentResults] = useState<
    GafferTeamSearchResult[]
  >([]);
  const [isSearchingGafferOpponent, setIsSearchingGafferOpponent] =
    useState(false);
  const [gafferOpponentSearchCompleted, setGafferOpponentSearchCompleted] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const venueSearchIdRef = useRef(0);
  const gafferOpponentSearchIdRef = useRef(0);
  const initializedFormRef = useRef<string | null>(null);

  const competitionOptions = useMemo(
    () =>
      (competitionsQuery.data ?? []).filter(
        (competition) =>
          competition.type !== "friendly" ||
          competition.id === event?.competitionId,
      ),
    [competitionsQuery.data, event?.competitionId],
  );

  useEffect(() => {
    if (!open) {
      initializedFormRef.current = null;
      return;
    }

    // Polling may replace the event object while the user is typing.
    const formKey = event?.id ?? "new";
    if (initializedFormRef.current === formKey) return;
    initializedFormRef.current = formKey;

    if (event) {
      const parts = splitScheduledAt(event.scheduledAt);
      setTitle(event.title);
      setType(event.type);
      setDate(parseLocalDate(parts.date));
      setTime(parts.time);
      setLocation(event.location);
      setVenueName(event.venueName ?? "");
      setVenueAddress(event.venueAddress ?? "");
      const savedPlaceMatchesLocation = Boolean(
        event.weatherLatitude != null &&
        event.weatherLongitude != null &&
        event.weatherLocation &&
        (event.weatherLocation === event.location ||
          event.weatherLocation.startsWith(`${event.location},`)),
      );
      setSelectedVenueLocation(savedPlaceMatchesLocation ? {
        id: event.id,
        name: event.location,
        displayName: event.weatherLocation ?? event.location,
        latitude: event.weatherLatitude!,
        longitude: event.weatherLongitude!,
        timezone: event.weatherTimezone,
      } : null);
      setVenueResults([]);
      setVenueSearchCompleted(false);
      setVenueSearchEnabled(!savedPlaceMatchesLocation && event.location.trim().length >= 3);
      setNotes(event.notes ?? "");
      setCompetitionId(event.competitionId ?? "none");
      setFriendlyPlayersPerSide(event.friendlyPlayersPerSide ?? 11);
      setGafferOpponentPick(
        event.friendlyOpponentTeamId && event.friendlyOpponentTeamName
          ? {
              id: event.friendlyOpponentTeamId,
              name: event.friendlyOpponentTeamName,
              primaryColor: null,
            }
          : null,
      );
    } else {
      setTitle("");
      setType(initialType ?? "training");
      setDate(initialDate ? startOfLocalDay(initialDate) : undefined);
      setTime("");
      setLocation("");
      setVenueName("");
      setVenueAddress("");
      setSelectedVenueLocation(null);
      setVenueResults([]);
      setVenueSearchCompleted(false);
      setVenueSearchEnabled(false);
      setNotes("");
      setCompetitionId("none");
      setFriendlyPlayersPerSide(11);
      setGafferOpponentPick(null);
    }
    setOpponentPick("");
    setError(null);
    setGafferOpponentQuery("");
    setGafferOpponentResults([]);
    setGafferOpponentSearchCompleted(false);
  }, [open, event, initialDate, initialType]);

  useEffect(() => {
    const query = location.trim();
    if (!open || !venueSearchEnabled || selectedVenueLocation || query.length < 3) {
      setVenueResults([]);
      setIsSearchingVenue(false);
      setVenueSearchCompleted(false);
      return;
    }

    const searchId = ++venueSearchIdRef.current;
    const timeout = window.setTimeout(() => {
      setIsSearchingVenue(true);
      void searchLocations(query)
        .then((results) => {
          if (venueSearchIdRef.current === searchId) {
            setVenueResults(results);
            setVenueSearchCompleted(true);
          }
        })
        .catch((err) => {
          if (venueSearchIdRef.current === searchId) {
            setError(err instanceof ApiError ? err.message : "Could not search locations.");
          }
        })
        .finally(() => {
          if (venueSearchIdRef.current === searchId) setIsSearchingVenue(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      venueSearchIdRef.current += 1;
    };
  }, [location, open, selectedVenueLocation, venueSearchEnabled]);

  const opponentTeams = useMemo(
    () =>
      opponentSuggestionsFromStandings(
        competitionsQuery.data,
        competitionId,
      ),
    [competitionsQuery.data, competitionId],
  );
  const showOpponentTeamSelect =
    type === "match" && opponentTeams.length > 0;
  /**
   * Friendly-fixture picker: manual match events (no competition) can
   * request another Gaffer team as the opponent. The pick is locked once
   * the fixture has been accepted — both calendars then share the same
   * fixture, so the opponent must not be swapped from one side only.
   */
  const showGafferOpponentPicker =
    type === "match" && competitionId === "none" && !event?.competitionFixtureId;
  const friendlyFixtureLocked = event?.friendlyFixtureStatus === "accepted";
  // A pick that matches the event's existing link shows that request's live
  // status (pending / declined); a fresh pick has no status yet.
  const gafferOpponentStatus: FriendlyFixtureStatus | null =
    gafferOpponentPick && event?.friendlyOpponentTeamId === gafferOpponentPick.id
      ? (event?.friendlyFixtureStatus ?? null)
      : null;
  const typeStyle = getEventTypeStyle(type);
  const competitionItems = useMemo(() => {
    const items: Record<string, string> = { none: "No competition" };
    for (const competition of competitionOptions) {
      items[competition.id] = competitionOptionLabel(competition);
    }
    return items;
  }, [competitionOptions]);
  const opponentItems = useMemo(
    () => Object.fromEntries(opponentTeams.map((name) => [name, name])),
    [opponentTeams],
  );

  const searchGafferOpponent = () => {
    const query = gafferOpponentQuery.trim();
    const searchId = ++gafferOpponentSearchIdRef.current;
    setIsSearchingGafferOpponent(true);
    setGafferOpponentSearchCompleted(false);
    setError(null);
    void searchGafferTeams(query)
      .then((results) => {
        if (gafferOpponentSearchIdRef.current === searchId) {
          setGafferOpponentResults(results);
          setGafferOpponentSearchCompleted(true);
        }
      })
      .catch((err) => {
        if (gafferOpponentSearchIdRef.current === searchId) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not search Gaffer teams.",
          );
        }
      })
      .finally(() => {
        if (gafferOpponentSearchIdRef.current === searchId) {
          setIsSearchingGafferOpponent(false);
        }
      });
  };

  const isPending = createEvent.isPending || updateEvent.isPending;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !date || !time) {
      setError("Title, type, date, and time are required.");
      return;
    }

    if (!venueName.trim()) {
      setError("Venue name is required.");
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError("Enter a valid date and time.");
      return;
    }

    const scheduledAt = combineScheduledAt(formatLocalDate(date), time);
    const scheduleError = eventScheduleError(scheduledAt, Boolean(event));
    if (scheduleError) {
      setError(scheduleError);
      return;
    }

    if (location.trim() && !selectedVenueLocation) {
      setError("Choose a location from the suggestions so its forecast uses the same place.");
      return;
    }

    const values: EventFormValues = {
      title,
      type,
      scheduledAt,
      location,
      venueName,
      venueAddress,
      forecastLocation: selectedVenueLocation,
      notes: notes.trim(),
      competitionId,
      opponentTeamId: gafferOpponentPick?.id ?? null,
      friendlyPlayersPerSide,
    };

    try {
      if (event) {
        await updateEvent.mutateAsync({
          id: event.id,
          // Accepted fixtures keep their opponent link; pending ones can change.
          input: updateEventInput(values, friendlyFixtureLocked),
        });
      } else {
        await createEvent.mutateAsync(createEventInput(values));
      }
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save this event. Please try again.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatedModalContent
        className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold uppercase tracking-wide text-foreground">
            {isEditing ? "Event details" : "New event"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isEditing
              ? "Update the schedule, location, or notes for this event."
              : "Add a training session, match, or meeting to the team calendar."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <Field label="Event Type">
            <div
              role="radiogroup"
              aria-label="Event type"
              className="grid grid-cols-3 gap-2"
            >
              {FORM_EVENT_TYPE_ORDER.map((eventType) => {
                const option = EVENT_TYPE_OPTIONS.find(
                  (entry) => entry.value === eventType,
                );
                if (!option) {
                  return null;
                }
                const selected = type === eventType;
                return (
                  <button
                    key={eventType}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(eventType)}
                    className={cn(
                      "h-11 rounded-full border px-2 text-sm font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected
                        ? cn(
                            "border-transparent",
                            getEventTypeStyle(eventType).action,
                          )
                        : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {type === "match" ? (
            <Field label="Competition">
              <Select
                value={competitionId}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  setCompetitionId(value);
                  setOpponentPick("");
                }}
                items={competitionItems}
                modal={false}
              >
                <SelectTrigger className={cn(inputClassName, "w-full justify-between pr-2")}>
                  <SelectValue placeholder="Select a competition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No competition</SelectItem>
                  {competitionOptions.map((competition) => (
                    <SelectItem key={competition.id} value={competition.id}>
                      {competitionOptionLabel(competition)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {type === "match" && competitionId === "none" ? (
            <Field label="Match Format">
              <Select value={String(friendlyPlayersPerSide)} onValueChange={(value) => setFriendlyPlayersPerSide(Number(value) as 5 | 7 | 11)} items={[{ value: '5', label: '5-a-side' }, { value: '7', label: '7-a-side' }, { value: '11', label: '11-a-side' }]} modal={false} disabled={friendlyFixtureLocked || Boolean(event?.lineupConfirmedAt)}>
                <SelectTrigger className={cn(inputClassName, "w-full justify-between pr-2")}>
                  <SelectValue placeholder="Match format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5-a-side</SelectItem>
                  <SelectItem value="7">7-a-side</SelectItem>
                  <SelectItem value="11">11-a-side</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Each team must confirm {friendlyPlayersPerSide} starting players.</p>
            </Field>
          ) : null}

          {showOpponentTeamSelect ? (
            <Field label="Opponent Team">
              <Select
                value={opponentPick || null}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  setOpponentPick(value);
                  setTitle(value);
                }}
                items={opponentItems}
                modal={false}
              >
                <SelectTrigger className={cn(inputClassName, "w-full justify-between pr-2")}>
                  <SelectValue placeholder="Choose from competition" />
                </SelectTrigger>
                <SelectContent>
                  {opponentTeams.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {showGafferOpponentPicker ? (
            <Field
              htmlFor={`${baseId}-gaffer-opponent`}
              label="Gaffer opponent (optional)"
            >
              {friendlyFixtureLocked ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-foreground">
                  <p className="flex items-center gap-1 font-medium text-emerald-500">
                    <Check className="size-3" />
                    Friendly fixture confirmed
                  </p>
                  <p className="mt-1">
                    {event?.friendlyOpponentTeamName ?? title}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Accepted fixtures are the same match on both calendars, so
                    the opponent cannot be changed here.
                  </p>
                </div>
              ) : gafferOpponentPick ? (
                <>
                  <GafferOpponentCard
                    name={gafferOpponentPick.name}
                    status={gafferOpponentStatus}
                    onRemove={() => {
                      setGafferOpponentPick(null);
                      setGafferOpponentQuery("");
                      setGafferOpponentResults([]);
                      setGafferOpponentSearchCompleted(false);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave this empty to play an opponent without a Gaffer
                    account instead.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      id={`${baseId}-gaffer-opponent`}
                      value={gafferOpponentQuery}
                      onChange={(e) => {
                        gafferOpponentSearchIdRef.current += 1;
                        setGafferOpponentQuery(e.target.value);
                        setIsSearchingGafferOpponent(false);
                        setGafferOpponentResults([]);
                        setGafferOpponentSearchCompleted(false);
                      }}
                      placeholder="Search teams or coach names"
                      className={inputClassName}
                      maxLength={100}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        isSearchingGafferOpponent ||
                        gafferOpponentQuery.trim().length < 2
                      }
                      onClick={searchGafferOpponent}
                    >
                      <Search className="size-4" />
                      {isSearchingGafferOpponent ? "Searching…" : "Search"}
                    </Button>
                  </div>
                  {gafferOpponentResults.length > 0 && (
                    <div className="rounded-md border border-border bg-background p-1">
                      {gafferOpponentResults.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          className="block w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          onClick={() => {
                            setGafferOpponentPick(team);
                            setTitle(team.name);
                            setGafferOpponentResults([]);
                            setGafferOpponentSearchCompleted(false);
                          }}
                        >
                          {team.name}
                          {team.coachName ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              Coach: {team.coachName}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                  {gafferOpponentSearchCompleted &&
                    gafferOpponentResults.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No Gaffer teams found. Leave this empty to enter a
                        free-text opponent instead.
                      </p>
                    )}
                  <p className="text-xs text-muted-foreground">
                    Pick another team on Gaffer to send them a friendly fixture
                    request — they confirm before the match appears on their
                    calendar. Your own team is never listed.
                  </p>
                </>
              )}
            </Field>
          ) : null}

          <Field htmlFor={`${baseId}-title`} label="Title">
            <input
              id={`${baseId}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Saturday training"
              className={inputClassName}
              required
              maxLength={150}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Date">
              <DatePicker
                value={date}
                disablePast={!isEditing}
                readOnly={!isEditing && Boolean(initialDate)}
                onChange={(next) => {
                  setDate(next);
                  if (
                    !isEditing &&
                    next &&
                    time &&
                    isScheduleInThePast(next, time)
                  ) {
                    setTime("");
                  }
                }}
              />
            </Field>
            <Field label="Time">
              <TimePicker
                value={time}
                date={date}
                disablePast={!isEditing}
                onChange={setTime}
              />
            </Field>
          </div>

          <Field htmlFor={`${baseId}-location`} label="Location">
            <input
              id={`${baseId}-location`}
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setLocationMessage(null);
                setSelectedVenueLocation(null);
                setVenueSearchEnabled(true);
              }}
              placeholder="Search for a place or area"
              className={inputClassName}
              maxLength={200}
              autoComplete="off"
              aria-describedby={`${baseId}-location-hint`}
            />
            <p id={`${baseId}-location-hint`} className="mt-1 text-xs text-muted-foreground">
              Choose a place from the suggestions, or use your coordinates to find a nearby town. The forecast always uses this location.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              disabled={locating || !navigator.geolocation}
              onClick={() => {
                if (!navigator.geolocation) return;
                setLocating(true);
                setLocationMessage(null);
                navigator.geolocation.getCurrentPosition(
                  async ({ coords }) => {
                    try {
                      const place = await reverseSearchLocation(coords.latitude, coords.longitude);
                      const current = {
                        ...place,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      };
                      setLocation(current.name);
                      setSelectedVenueLocation(current);
                      setVenueResults([]);
                      setVenueSearchEnabled(false);
                      setLocationMessage(`Nearby town selected for the forecast: ${current.displayName}.`);
                    } catch {
                      setLocation("");
                      setSelectedVenueLocation(null);
                      setLocationMessage("Could not find a nearby town or city. Search for one or enter a place manually.");
                    } finally {
                      setLocating(false);
                    }
                  },
                  () => {
                    setLocationMessage("Could not access your location. Check browser permission or enter a place manually.");
                    setLocating(false);
                  },
                  { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
                );
              }}
            >
              <LocateFixed className="mr-2 size-4" />
              {locating ? "Getting location…" : "Use my current location"}
            </Button>
            {locationMessage && <p role="status" className="mt-1 text-xs text-muted-foreground">{locationMessage}</p>}
            {isSearchingVenue && <p role="status" className="text-xs text-muted-foreground">Searching places…</p>}
            {venueResults.length > 0 && !selectedVenueLocation && (
              <div role="listbox" aria-label="Matching places" className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background p-1">
                {venueResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="block w-full rounded px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setSelectedVenueLocation(result);
                      setLocation(result.name);
                      setVenueSearchEnabled(false);
                      setVenueResults([]);
                      setVenueSearchCompleted(false);
                    }}
                  >
                    <span className="block text-sm font-medium text-foreground">{result.name}</span>
                    {result.displayName !== result.name && (
                      <span className="block text-xs text-muted-foreground">{result.displayName}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {venueSearchCompleted && venueResults.length === 0 && location.trim().length >= 3 && !selectedVenueLocation && (
              <p className="text-xs text-muted-foreground">No matching place found. Try a nearby town or city.</p>
            )}
            {selectedVenueLocation && (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-foreground">
                <p className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  <span>Forecast will use {selectedVenueLocation.displayName}.</span>
                </p>
                <button
                  type="button"
                  className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedVenueLocation(null);
                    setLocation("");
                    setVenueSearchEnabled(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            <Field htmlFor={`${baseId}-venue-name`} label="Venue name">
              <input
                id={`${baseId}-venue-name`}
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. Riverside Sports Ground"
                className={inputClassName}
                maxLength={200}
                required
              />
            </Field>

            <section className="mt-3 rounded-md border border-border bg-background p-3 text-sm">
              <h3 className="font-medium text-foreground">Optional venue details</h3>
              <div className="mt-3 flex flex-col gap-4">
                <Field htmlFor={`${baseId}-address`} label="Venue address (optional)">
                  <input
                    id={`${baseId}-address`}
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    placeholder="e.g. 12 River Road"
                    className={inputClassName}
                    maxLength={300}
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Current-location place names © OpenStreetMap contributors.</p>
            </section>
          </Field>

          <Field htmlFor={`${baseId}-notes`} label="Notes">
            <Textarea
              id={`${baseId}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional session notes"
              rows={4}
              maxLength={2000}
              className="min-h-24 bg-background"
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <StatefulButton
            type="submit"
            disabled={isPending}
            className={cn(
              "mt-1 w-full font-semibold tracking-wide",
              typeStyle.action,
            )}
            status={isPending ? "loading" : "idle"}
            loadingText={isEditing ? "Saving event..." : "Creating event..."}
          >
            {isPending
              ? isEditing
                ? "SAVING…"
                : "CREATING…"
              : isEditing
                ? "SAVE EVENT"
                : "CREATE EVENT"}
          </StatefulButton>
        </form>
      </AnimatedModalContent>
    </Dialog>
  );
}

function DatePicker({
  value,
  onChange,
  disablePast = false,
  readOnly = false,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disablePast?: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = startOfLocalDay();

  if (readOnly) {
    return (
      <div
        className={cn(
          inputClassName,
          "flex items-center justify-start gap-2 text-left font-normal",
        )}
        aria-readonly="true"
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        {value ? (
          formatDateLabel(value)
        ) : (
          <span className="text-muted-foreground">No date selected</span>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        type="button"
        className={cn(
          inputClassName,
          "flex items-center justify-start gap-2 text-left font-normal",
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        {value ? (
          formatDateLabel(value)
        ) : (
          <span className="text-muted-foreground">Pick a date</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value ?? today}
          disabled={disablePast ? { before: today } : undefined}
          onSelect={(next) => {
            if (!next) {
              return;
            }
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TimePicker({
  value,
  onChange,
  date,
  disablePast = false,
}: {
  value: string;
  onChange: (time: string) => void;
  date: Date | undefined;
  disablePast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [hour = "00", minute = "00"] = value.split(":");

  useEffect(() => {
    if (!disablePast) {
      return;
    }

    const refreshNow = () => setNow(new Date());
    refreshNow();
    const interval = window.setInterval(refreshNow, 30_000);
    return () => window.clearInterval(interval);
  }, [disablePast]);

  const isTimePast = useCallback(
    (nextHour: string, nextMinute: string) =>
      Boolean(
        disablePast &&
          date &&
          isScheduleInThePast(date, `${nextHour}:${nextMinute}`, now),
      ),
    [date, disablePast, now],
  );

  const hourDisabled = (nextHour: string) =>
    Boolean(
      disablePast &&
        date &&
        TIME_MINUTES.every((nextMinute) => isTimePast(nextHour, nextMinute)),
    );

  const minuteDisabled = (nextMinute: string) =>
    Boolean(disablePast && date && isTimePast(hour, nextMinute));

  useEffect(() => {
    if (!value || !disablePast || !date || !isTimePast(hour, minute)) {
      return;
    }

    const nextTime = TIME_HOURS.flatMap((nextHour) =>
      TIME_MINUTES.map((nextMinute) => `${nextHour}:${nextMinute}`),
    ).find((candidate) => {
      const [candidateHour, candidateMinute] = candidate.split(":");
      return !isTimePast(candidateHour, candidateMinute);
    });

    onChange(nextTime ?? "");
  }, [date, disablePast, hour, isTimePast, minute, onChange, value]);

  const selectHour = (nextHour: string) => {
    if (hourDisabled(nextHour)) {
      return;
    }

    const nextMinute = !isTimePast(nextHour, minute)
      ? minute
      : (TIME_MINUTES.find(
          (candidateMinute) => !isTimePast(nextHour, candidateMinute),
        ) ?? minute);
    onChange(`${nextHour}:${nextMinute}`);
  };

  const selectMinute = (nextMinute: string) => {
    if (minuteDisabled(nextMinute)) {
      return;
    }
    onChange(`${hour}:${nextMinute}`);
    setOpen(false);
  };

  const selectingToday = Boolean(
    disablePast && date && formatLocalDate(date) === formatLocalDate(now),
  );

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        type="button"
        className={cn(
          inputClassName,
          "flex items-center justify-between text-left font-normal",
        )}
      >
        <span className="flex items-center gap-2">
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="tabular-nums">{formatTimeLabel(value)}</span>
          ) : (
            <span className="text-muted-foreground">Pick a time</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">Choose time</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="mb-2 flex items-center justify-between gap-6 px-1">
          <p className="text-xs font-medium">Event time</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {value ? formatTimeLabel(value) : "Not selected"}
          </p>
        </div>
        <div className="flex gap-2">
          <TimeColumn
            label="Hours"
            options={TIME_HOURS}
            selected={value ? hour : undefined}
            isDisabled={hourDisabled}
            onSelect={selectHour}
          />
          <TimeColumn
            label="Minutes"
            options={TIME_MINUTES}
            selected={value ? minute : undefined}
            isDisabled={minuteDisabled}
            onSelect={selectMinute}
          />
        </div>
        {selectingToday && (
          <p className="mt-2 max-w-36 text-[11px] leading-4 text-muted-foreground">
            Past times are unavailable.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  options,
  selected,
  isDisabled,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | undefined;
  isDisabled: (option: string) => boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="h-52 w-16 overflow-y-auto rounded-md border border-border bg-background p-1">
        {options.map((option) => {
          const isSelected = option === selected;
          const disabled = isDisabled(option);
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={cn(
                "flex h-8 w-full items-center justify-center rounded text-sm tabular-nums transition-colors",
                disabled && "cursor-not-allowed opacity-30",
                !disabled && isSelected && "bg-primary text-primary-foreground",
                !disabled && !isSelected && "text-foreground hover:bg-muted",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function friendlyFixtureCopy(status: FriendlyFixtureStatus | null) {
  const copy: Record<
    FriendlyFixtureStatus | "new",
    { heading: string; tone: string; headingTone: string; hint: string }
  > = {
    pending: {
      heading: "Friendly fixture request sent",
      tone: "border-emerald-500/30 bg-emerald-500/5",
      headingTone: "text-emerald-500",
      hint: "Waiting for them to accept — you can still change the date, venue, or opponent.",
    },
    declined: {
      heading: "Friendly fixture declined",
      tone: "border-destructive/30 bg-destructive/5",
      headingTone: "text-destructive",
      hint: "They declined this fixture. Pick another Gaffer team or remove the opponent.",
    },
    cancelled: {
      heading: "Friendly fixture cancelled",
      tone: "border-border bg-muted/30",
      headingTone: "text-muted-foreground",
      hint: "This request was cancelled. Pick a team to send a new one.",
    },
    accepted: {
      heading: "Friendly fixture request will be sent",
      tone: "border-emerald-500/30 bg-emerald-500/5",
      headingTone: "text-emerald-500",
      hint: "They confirm the match before it appears on their calendar.",
    },
    new: {
      heading: "Friendly fixture request will be sent",
      tone: "border-emerald-500/30 bg-emerald-500/5",
      headingTone: "text-emerald-500",
      hint: "They confirm the match before it appears on their calendar.",
    },
  };
  return copy[status ?? "new"];
}

/**
 * Selected-Gaffer-opponent summary card. `status` is null for a fresh pick,
 * or the live fixture status when the pick matches the event's existing
 * link, so the coach sees whether the request is awaiting, declined, etc.
 */
function GafferOpponentCard({
  name,
  status,
  onRemove,
}: {
  name: string;
  status: FriendlyFixtureStatus | null;
  onRemove: () => void;
}) {
  const { heading, tone, headingTone, hint } = friendlyFixtureCopy(status);
  return (
    <div className={cn("rounded-md border p-2 text-xs text-foreground", tone)}>
      <p className={cn("flex items-center gap-1 font-medium", headingTone)}>
        <Check className="size-3" />
        {heading}
      </p>
      <p className="mt-1">{name}</p>
      <p className="mt-0.5 text-muted-foreground">{hint}</p>
      <button
        type="button"
        className="mt-1 font-medium text-primary hover:underline"
        onClick={onRemove}
      >
        Remove Gaffer opponent
      </button>
    </div>
  );
}
