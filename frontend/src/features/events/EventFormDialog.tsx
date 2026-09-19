import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { CalendarIcon, Check, ClockIcon, MapPinned, Search } from "lucide-react";
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
import {
  EVENT_TYPE_ITEMS,
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
import { searchLocations } from "./api";
import type { EventType, LocationSearchResult, TeamEvent } from "./types";

const inputClassName =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

const TIME_HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const TIME_MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

interface EventFormDialogProps {
  open: boolean;
  event?: TeamEvent;
  /** Date prefilled when creating from a calendar day click. */
  initialDate?: Date;
  /** Event type prefilled when creating from a calendar menu action. */
  initialType?: EventType;
  /** Allow scheduling in the past (logging history from the calendar). */
  allowPastDate?: boolean;
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
  allowPastDate = false,
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
  const [venueAddress, setVenueAddress] = useState("");
  const [weatherLocationQuery, setWeatherLocationQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationSearchResult | null>(null);
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSearchCompleted, setLocationSearchCompleted] = useState(false);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [manualTimezone, setManualTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [notes, setNotes] = useState("");
  const [competitionId, setCompetitionId] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const locationSearchIdRef = useRef(0);

  const competitionOptions = (competitionsQuery.data ?? []).filter(
    (competition) =>
      competition.type !== "friendly" || competition.id === event?.competitionId,
  );
  const selectedCompetition = competitionOptions.find(
    (competition) => competition.id === competitionId,
  );
  const selectedCompetitionLabel =
    competitionId === "none"
      ? "No competition (Friendly)"
      : selectedCompetition
        ? `${selectedCompetition.name}${
            selectedCompetition.season ? ` (${selectedCompetition.season})` : ""
          }`
        : competitionsQuery.isLoading
          ? "Loading competition..."
          : "Competition unavailable";

  useEffect(() => {
    if (!open) {
      return;
    }

    if (event) {
      const parts = splitScheduledAt(event.scheduledAt);
      setTitle(event.title);
      setType(event.type);
      setDate(parseLocalDate(parts.date));
      setTime(parts.time);
      setLocation(event.location);
      setVenueAddress(event.venueAddress ?? "");
      setWeatherLocationQuery(event.weatherLocation ?? "");
      setSelectedLocation(event.weatherLatitude != null && event.weatherLongitude != null ? {
        id: event.id,
        name: event.weatherLocation ?? event.location,
        displayName: event.weatherLocation ?? event.location,
        latitude: event.weatherLatitude,
        longitude: event.weatherLongitude,
        timezone: event.weatherTimezone,
      } : null);
      setManualLatitude(event.weatherLatitude?.toString() ?? "");
      setManualLongitude(event.weatherLongitude?.toString() ?? "");
      setManualTimezone(event.weatherTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
      setNotes(event.notes ?? "");
      setCompetitionId(event.competitionId ?? "none");
    } else {
      setTitle("");
      setType(initialType ?? "training");
      setDate(initialDate ? startOfLocalDay(initialDate) : undefined);
      setTime("");
      setLocation("");
      setVenueAddress("");
      setWeatherLocationQuery("");
      setSelectedLocation(null);
      setManualLatitude("");
      setManualLongitude("");
      setManualTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setNotes("");
      setCompetitionId("none");
    }
    setError(null);
    setLocationResults([]);
    setLocationSearchCompleted(false);
  }, [open, event, initialDate, initialType]);

  const useExactCoordinates = () => {
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    const timezone = manualTimezone.trim();
    if (
      manualLatitude.trim() === "" ||
      manualLongitude.trim() === "" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("Enter valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    } catch {
      setError("Enter a valid IANA timezone, such as Africa/Johannesburg.");
      return;
    }
    const displayName = weatherLocationQuery.trim() || `${latitude}, ${longitude}`;
    setSelectedLocation({
      id: `coordinates:${latitude}:${longitude}`,
      name: displayName,
      displayName,
      latitude,
      longitude,
      timezone,
    });
    setWeatherLocationQuery(displayName);
    setLocationResults([]);
    setLocationSearchCompleted(false);
    setError(null);
  };

  const isPending = createEvent.isPending || updateEvent.isPending;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !date || !time || !location.trim()) {
      setError("Title, type, date, time, and venue name are required.");
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError("Enter a valid date and time.");
      return;
    }

    const scheduledAt = combineScheduledAt(formatLocalDate(date), time);
    if (Number.isNaN(new Date(scheduledAt).getTime())) {
      setError("Enter a valid date and time.");
      return;
    }

    if (!event && !allowPastDate && new Date(scheduledAt).getTime() <= Date.now()) {
      setError("Choose a date and time in the future.");
      return;
    }

    const notesValue = notes.trim();

    try {
      if (event) {
        await updateEvent.mutateAsync({
          id: event.id,
          input: {
            title: title.trim(),
            type,
            scheduledAt,
            location: location.trim(),
            venueAddress: venueAddress.trim() || null,
            weatherLocation: selectedLocation?.displayName ?? null,
            weatherLatitude: selectedLocation?.latitude ?? null,
            weatherLongitude: selectedLocation?.longitude ?? null,
            weatherTimezone: selectedLocation?.timezone ?? null,
            notes: notesValue.length > 0 ? notesValue : null,
            competitionId:
              type === "match" && competitionId !== "none" ? competitionId : null,
          },
        });
      } else {
        await createEvent.mutateAsync({
          title: title.trim(),
          type,
          scheduledAt,
          location: location.trim(),
          venueAddress: venueAddress.trim() || null,
          weatherLocation: selectedLocation?.displayName ?? null,
          weatherLatitude: selectedLocation?.latitude ?? null,
          weatherLongitude: selectedLocation?.longitude ?? null,
          weatherTimezone: selectedLocation?.timezone ?? null,
          ...(notesValue.length > 0 ? { notes: notesValue } : {}),
          competitionId:
            type === "match" && competitionId !== "none" ? competitionId : null,
        });
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

          <Field label="Type">
            <Select
              value={type}
              onValueChange={(value) => {
                if (value) {
                  setType(value);
                }
              }}
              items={EVENT_TYPE_ITEMS}
              modal={false}
            >
              <SelectTrigger className={cn(inputClassName, "w-full justify-between pr-2")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Date">
              <DatePicker
                value={date}
                disablePast={!isEditing && !allowPastDate}
                onChange={(next) => {
                  setDate(next);
                  if (
                    !isEditing &&
                    !allowPastDate &&
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
                disablePast={!isEditing && !allowPastDate}
                onChange={setTime}
              />
            </Field>
          </div>

          <Field htmlFor={`${baseId}-location`} label="Venue name">
            <input
              id={`${baseId}-location`}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Riverside Sports Ground"
              className={inputClassName}
              required
              maxLength={200}
            />
          </Field>

          <Field htmlFor={`${baseId}-address`} label="Street address">
            <input
              id={`${baseId}-address`}
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="e.g. 1 Sport Street, Stellenbosch"
              className={inputClassName}
              maxLength={300}
            />
          </Field>

          <Field htmlFor={`${baseId}-weather-location`} label="Weather location">
            <div className="flex gap-2">
              <input
                id={`${baseId}-weather-location`}
                value={weatherLocationQuery}
                onChange={(e) => {
                  locationSearchIdRef.current += 1;
                  setWeatherLocationQuery(e.target.value);
                  setIsSearchingLocation(false);
                  setSelectedLocation(null);
                  setLocationResults([]);
                  setLocationSearchCompleted(false);
                }}
                placeholder="Town, suburb, or postcode"
                className={inputClassName}
                maxLength={300}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isSearchingLocation || weatherLocationQuery.trim().length < 3}
                onClick={() => {
                  const query = weatherLocationQuery.trim();
                  const searchId = ++locationSearchIdRef.current;
                  setIsSearchingLocation(true);
                  setLocationSearchCompleted(false);
                  setError(null);
                  void searchLocations(query)
                    .then((results) => {
                      if (locationSearchIdRef.current === searchId) {
                        setLocationResults(results);
                        setLocationSearchCompleted(true);
                      }
                    })
                    .catch((err) => {
                      if (locationSearchIdRef.current === searchId) {
                        setError(err instanceof ApiError ? err.message : "Could not search locations.");
                      }
                    })
                    .finally(() => {
                      if (locationSearchIdRef.current === searchId) setIsSearchingLocation(false);
                    });
                }}
              >
                <Search className="size-4" />
                {isSearchingLocation ? "Searching…" : "Find"}
              </Button>
            </div>
            {selectedLocation && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-foreground">
                <p className="flex items-center gap-1 font-medium text-emerald-500">
                  <Check className="size-3" />Selected forecast location
                </p>
                <p className="mt-1">{selectedLocation.displayName}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {selectedLocation.latitude.toFixed(5)}, {selectedLocation.longitude.toFixed(5)}
                  {selectedLocation.timezone ? ` · ${selectedLocation.timezone}` : ""}
                </p>
              </div>
            )}
            {locationResults.length > 0 && !selectedLocation && (
              <div className="rounded-md border border-border bg-background p-1">
                {locationResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                    onClick={() => {
                      setSelectedLocation(result);
                      setWeatherLocationQuery(result.displayName);
                      setManualLatitude(String(result.latitude));
                      setManualLongitude(String(result.longitude));
                      setManualTimezone(result.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
                      setLocationResults([]);
                      setLocationSearchCompleted(false);
                    }}
                  >{result.displayName}</button>
                ))}
              </div>
            )}
            {locationSearchCompleted && locationResults.length === 0 && !selectedLocation && (
              <p className="text-xs text-muted-foreground">No locations found.</p>
            )}
            <p className="text-xs text-muted-foreground">Choose a nearby town or suburb so the forecast uses the correct coordinates.</p>
            <details className="rounded-md border border-border bg-background p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
                <MapPinned className="size-4" />Use exact coordinates
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">
                  Latitude
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={manualLatitude}
                    onChange={(e) => setManualLatitude(e.target.value)}
                    className={cn(inputClassName, "mt-1")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Longitude
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={manualLongitude}
                    onChange={(e) => setManualLongitude(e.target.value)}
                    className={cn(inputClassName, "mt-1")}
                  />
                </label>
                <label className="col-span-2 text-xs text-muted-foreground">
                  Venue timezone
                  <input
                    value={manualTimezone}
                    onChange={(e) => setManualTimezone(e.target.value)}
                    placeholder="Africa/Johannesburg"
                    className={cn(inputClassName, "mt-1")}
                  />
                </label>
                <Button type="button" variant="outline" className="col-span-2" onClick={useExactCoordinates}>
                  Use these coordinates
                </Button>
              </div>
            </details>
          </Field>

          {type === "match" && (
            <Field label="Competition">
              <Select
                value={competitionId}
                onValueChange={(value) => value && setCompetitionId(value)}
                modal={false}
              >
                <SelectTrigger className={cn(inputClassName, "w-full justify-between pr-2")}>
                  <SelectValue>{selectedCompetitionLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No competition (Friendly)</SelectItem>
                  {competitionOptions.map((competition) => (
                    <SelectItem key={competition.id} value={competition.id}>
                      {competition.name}
                      {competition.season ? ` (${competition.season})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

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
            className="mt-1 w-full font-semibold tracking-wide"
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
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disablePast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = startOfLocalDay();

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
  const [hour, minute] = value.split(":");
  const hourRef = useRef<HTMLButtonElement>(null);
  const minuteRef = useRef<HTMLButtonElement>(null);
  const now = new Date();

  const isHourDisabled = (option: string) =>
    Boolean(
      disablePast && date && isScheduleInThePast(date, `${option}:59`, now),
    );
  const isMinuteDisabled = (option: string) =>
    Boolean(
      disablePast &&
        date &&
        hour &&
        isScheduleInThePast(date, `${hour}:${option}`, now),
    );

  useEffect(() => {
    if (!open) {
      return;
    }
    hourRef.current?.scrollIntoView({ block: "nearest" });
    minuteRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, hour, minute]);

  const setPart = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        type="button"
        className={cn(
          inputClassName,
          "flex items-center justify-start gap-2 text-left font-normal",
        )}
      >
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
        {value ? (
          formatTimeLabel(value)
        ) : (
          <span className="text-muted-foreground">Pick a time</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex gap-2">
          <TimeColumn
            label="Hours"
            options={TIME_HOURS}
            selected={hour}
            selectedRef={hourRef}
            isDisabled={isHourDisabled}
            onSelect={(nextHour) => {
              const minuteStillValid =
                Boolean(minute) &&
                !(
                  disablePast &&
                  date &&
                  isScheduleInThePast(date, `${nextHour}:${minute}`, now)
                );
              const nextMinute = minuteStillValid
                ? minute
                : (TIME_MINUTES.find(
                    (option) =>
                      !(
                        disablePast &&
                        date &&
                        isScheduleInThePast(date, `${nextHour}:${option}`, now)
                      ),
                  ) ?? "00");
              setPart(nextHour, nextMinute);
              if (minuteStillValid) {
                setOpen(false);
              }
            }}
          />
          <TimeColumn
            label="Minutes"
            options={TIME_MINUTES}
            selected={minute}
            selectedRef={minuteRef}
            isDisabled={isMinuteDisabled}
            onSelect={(nextMinute) => {
              const hourStillValid =
                Boolean(hour) &&
                !(
                  disablePast &&
                  date &&
                  isScheduleInThePast(date, `${hour}:${nextMinute}`, now)
                );
              const nextHour = hourStillValid
                ? hour
                : (TIME_HOURS.find(
                    (option) =>
                      !(
                        disablePast &&
                        date &&
                        isScheduleInThePast(date, `${option}:${nextMinute}`, now)
                      ),
                  ) ?? "00");
              setPart(nextHour, nextMinute);
              if (hourStillValid) {
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  options,
  selected,
  selectedRef,
  isDisabled,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | undefined;
  selectedRef: RefObject<HTMLButtonElement | null>;
  isDisabled: (option: string) => boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="h-48 w-14 overflow-y-auto rounded-md border border-border bg-background">
        {options.map((option) => {
          const isSelected = option === selected;
          const disabled = isDisabled(option);
          return (
            <button
              key={option}
              type="button"
              ref={isSelected ? selectedRef : undefined}
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={cn(
                "flex h-8 w-full items-center justify-center text-sm tabular-nums",
                disabled && "cursor-not-allowed opacity-35",
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
