import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { EventType, TeamEvent } from "./types";

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
  onOpenChange,
}: EventFormDialogProps) {
  const isEditing = Boolean(event);
  const baseId = useId();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("training");
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setNotes(event.notes ?? "");
    } else {
      setTitle("");
      setType("training");
      setDate(undefined);
      setTime("");
      setLocation("");
      setNotes("");
    }
    setError(null);
  }, [open, event]);

  const isPending = createEvent.isPending || updateEvent.isPending;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !date || !time || !location.trim()) {
      setError("Title, type, date, time, and location are required.");
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

    if (!event && new Date(scheduledAt).getTime() <= Date.now()) {
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
            notes: notesValue.length > 0 ? notesValue : null,
          },
        });
      } else {
        await createEvent.mutateAsync({
          title: title.trim(),
          type,
          scheduledAt,
          location: location.trim(),
          ...(notesValue.length > 0 ? { notes: notesValue } : {}),
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
      <DialogContent
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
                disablePast={!isEditing}
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
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Main field"
              className={inputClassName}
              required
              maxLength={200}
            />
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

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="mt-1 w-full font-semibold tracking-wide"
          >
            {isPending
              ? isEditing
                ? "SAVING…"
                : "CREATING…"
              : isEditing
                ? "SAVE EVENT"
                : "CREATE EVENT"}
          </Button>
        </form>
      </DialogContent>
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
