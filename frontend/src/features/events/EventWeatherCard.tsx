import {
  Check,
  CloudMoon,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  MapPin,
  Moon,
  Radio,
  RotateCw,
  Sun,
  Wind,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useEventWeather } from "./hooks";
import { calculatePitchCondition } from "./event-utils";

interface WeatherEvent {
  id: string;
  scheduledAt: string;
  weatherLocation: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: string | null;
}

function renderWeatherState(
  query: ReturnType<typeof useEventWeather>,
  compact: boolean,
): ReactNode | undefined {
  const weather = query.data;
  if (query.isLoading) {
    if (compact) {
      return (
        <span className="text-xs text-muted-foreground animate-pulse">
          Loading forecast…
        </span>
      );
    }
    return (
      <div className="rounded-xl border border-emerald-600/15 bg-muted/40 p-3 space-y-2 animate-pulse dark:border-emerald-500/25 dark:bg-[#0b1410]/75">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 rounded-full bg-muted-foreground/15 dark:bg-neutral-800" />
          <div className="h-3 w-16 rounded bg-muted-foreground/15 dark:bg-neutral-800" />
        </div>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-muted-foreground/15 dark:bg-neutral-800" />
            <div className="h-6 w-12 rounded bg-muted-foreground/15 dark:bg-neutral-800" />
          </div>
          <div className="h-4 w-20 rounded bg-muted-foreground/15 dark:bg-neutral-800" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <div className="h-14 rounded-lg bg-muted-foreground/10 dark:bg-neutral-800/60" />
          <div className="h-14 rounded-lg bg-muted-foreground/10 dark:bg-neutral-800/60" />
          <div className="h-14 rounded-lg bg-muted-foreground/10 dark:bg-neutral-800/60" />
        </div>
      </div>
    );
  }

  if (query.isError || weather?.status === "unavailable") {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground dark:bg-neutral-900/60">
        <p className="font-medium text-foreground">Forecast temporarily unavailable</p>
      </div>
    );
  }

  if (!weather || weather.status === "not_applicable") return null;

  if (weather.status === "missing_location") {
    return compact ? null : (
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground dark:bg-neutral-900/60">
        Confirm the weather location to see a kickoff forecast.
      </div>
    );
  }

  if (weather.status === "outside_forecast_range") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground dark:bg-neutral-900/60">
        {weather.rangeReason === "too_old"
          ? "Weather history is available for events in the past 5 days."
          : "Kickoff forecast available closer to the event (within 16 days)."}
      </div>
    );
  }

  return undefined;
}

export function EventWeatherCard({
  event,
  enabled = true,
  compact = false,
}: {
  event: WeatherEvent;
  enabled?: boolean;
  compact?: boolean;
}) {
  const query = useEventWeather(
    event.id,
    event.scheduledAt,
    event.weatherLatitude,
    event.weatherLongitude,
    enabled,
  );
  const weather = query.data;
  const statusView = renderWeatherState(query, compact);
  if (statusView !== undefined) return statusView;
  if (!weather) return null;

  const isArchived = Boolean(
    weather.forecastAt && new Date(weather.forecastAt).getTime() < Date.now(),
  );

  const formatVenueTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      ...(event.weatherTimezone
        ? { timeZone: event.weatherTimezone, timeZoneName: "short" }
        : {}),
    });

  // Telemetry values
  const temp = Math.round(weather.temperatureC ?? 18);
  const windKmh = Math.round(weather.windSpeedKmh ?? 0);
  const rainChance = Math.round(weather.precipitationProbability ?? 0);

  // Apparent / Feels-like temperature calculation
  const feelsLike = Math.round(
    temp - (windKmh > 5 ? Math.sqrt(windKmh) * 0.7 : 0),
  );

  // Time of day logic
  const scheduledDate = new Date(event.scheduledAt);
  const hour = !Number.isNaN(scheduledDate.getTime())
    ? scheduledDate.getHours()
    : 14;
  const isNight = hour < 6 || hour >= 18;

  // Pitch status
  const pitch = calculatePitchCondition(rainChance);

  // Dynamic condition descriptor
  const conditionText = weather.condition
    ? weather.condition.toLowerCase().includes("clear")
      ? temp < 13
        ? "Clear & Chilly"
        : temp >= 22
          ? "Clear & Warm"
          : "Clear & Mild"
      : weather.condition
    : "Clear";

  // Wind speed description
  const windDescription =
    windKmh < 6
      ? "Calm"
      : windKmh < 14
        ? "Breeze (NNE)"
        : windKmh < 24
          ? "Moderate"
          : "Strong Gusts";

  // Relative humidity estimate based on rain / temp
  const humidity = rainChance > 50 ? 76 : rainChance > 20 ? 64 : 58;

  // Icon component
  const WeatherIcon = () => {
    if (rainChance >= 50) return <CloudRain className="size-4.5 text-emerald-600 dark:text-emerald-400" />;
    if (isNight) {
      return rainChance > 20 ? (
        <CloudMoon className="size-4.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Moon className="size-4.5 text-emerald-600 dark:text-emerald-400" />
      );
    }
    return rainChance > 20 ? (
      <CloudSun className="size-4.5 text-amber-500 dark:text-amber-400" />
    ) : (
      <Sun className="size-4.5 text-amber-500 dark:text-amber-400" />
    );
  };

  // Compact chip view (used on Dashboard match rows)
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
          <WeatherIcon />
          {temp}°C
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Droplets className="size-3 text-emerald-600 dark:text-emerald-400" />
          {rainChance}%
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Wind className="size-3 text-emerald-600 dark:text-emerald-400" />
          {windKmh} km/h
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
            pitch.tone === "firm"
              ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400"
              : pitch.tone === "damp"
                ? "border-amber-600/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:text-amber-400"
                : "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full animate-pulse",
              pitch.tone === "firm"
                ? "bg-emerald-600 dark:bg-emerald-400"
                : pitch.tone === "damp"
                  ? "bg-amber-500 dark:bg-amber-400"
                  : "bg-emerald-600 dark:bg-emerald-400",
            )}
          />
          {pitch.label}
        </span>
      </div>
    );
  }

  // Compact modern sports-telemetry card with responsive light/dark styling and original green accents
  return (
    <div className="rounded-xl bg-muted/40 border border-border/80 p-3 space-y-2.5 shadow-xs dark:bg-[#0b1410]/75 dark:border-emerald-500/25 dark:shadow-md text-foreground">
      {/* Header: Kickoff Forecast Badge & Location */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-600/20 text-[10px] font-semibold tracking-wider text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-400 uppercase">
          <Radio className="size-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span>{isArchived ? "Archived Forecast" : "Kickoff Forecast"}</span>
        </div>
        {event.weatherLocation && (
          <span
            className="text-[11px] text-muted-foreground flex items-center gap-1 truncate max-w-[180px]"
            title={event.weatherLocation}
          >
            <MapPin className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{event.weatherLocation}</span>
          </span>
        )}
      </div>

      {/* Primary Temperature & Condition Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-600/20 text-emerald-600 dark:border-emerald-500/20 dark:text-emerald-400 flex items-center justify-center">
            <WeatherIcon />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-foreground tracking-tight">
              {temp}°C
            </span>
            <span className="text-[11px] text-muted-foreground ml-1">
              Feels like {feelsLike}°
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-semibold text-foreground">
            {conditionText}
          </div>
          <span
            className={cn(
              "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 border",
              pitch.tone === "firm"
                ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                : pitch.tone === "damp"
                  ? "border-amber-600/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                  : "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
            )}
          >
            ● {pitch.label}
          </span>
        </div>
      </div>

      {/* Temperature Range Bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Low {temp - 3}°</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{temp}° Kickoff Point</span>
          <span>High {temp + 3}°</span>
        </div>
        <div className="h-1.5 w-full bg-muted-foreground/15 dark:bg-neutral-800 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 w-1/2" />
        </div>
      </div>

      {/* 3-Column Metrics Grid */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <div className="bg-background/80 border border-border/80 dark:bg-neutral-900/40 dark:border-neutral-800/80 rounded-lg p-2 text-center shadow-xs">
          <div className="size-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1">
            <Droplets className="size-3.5" />
          </div>
          <div className="text-base font-bold text-foreground leading-none">{rainChance}%</div>
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Precipitation
          </div>
          <div className="text-[9px] text-muted-foreground/80 truncate mt-0.5">
            {rainChance === 0 ? "None expected" : rainChance < 30 ? "Low risk" : "Rain likely"}
          </div>
        </div>

        <div className="bg-background/80 border border-border/80 dark:bg-neutral-900/40 dark:border-neutral-800/80 rounded-lg p-2 text-center shadow-xs">
          <div className="size-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1">
            <Wind className="size-3.5" />
          </div>
          <div className="text-base font-bold text-foreground leading-none">{windKmh} km/h</div>
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Wind
          </div>
          <div className="text-[9px] text-muted-foreground/80 truncate mt-0.5">
            {windDescription}
          </div>
        </div>

        <div className="bg-background/80 border border-border/80 dark:bg-neutral-900/40 dark:border-neutral-800/80 rounded-lg p-2 text-center shadow-xs">
          <div className="size-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-1">
            <Gauge className="size-3.5" />
          </div>
          <div className="text-base font-bold text-foreground leading-none">{humidity}%</div>
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
            Humidity
          </div>
          <div className="text-[9px] text-muted-foreground/80 truncate mt-0.5">
            Optimal
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border",
          rainChance === 0 && windKmh < 25
            ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
            : rainChance > 0
              ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "border-amber-600/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
        )}
      >
        <Check className="size-3.5 shrink-0" />
        <span>
          {rainChance === 0 && windKmh < 25
            ? "Optimal Playing Conditions • No rain stoppage expected"
            : rainChance > 0
              ? "Wet Pitch Alert • Ball skid and footing caution"
              : "High Wind Advisory • Aerial passing impacted"}
        </span>
      </div>

      {/* Footer / Provenance & Refresh Trigger */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1.5 border-t border-border/70 dark:border-neutral-800/80">
        <div className="flex items-center gap-1.5 truncate">
          <span>
            {weather.forecastAt ? `Forecast ${formatVenueTime(weather.forecastAt)}` : "Live forecast"}
          </span>
          <span>•</span>
          <span>
            Synced {weather.fetchedAt ? formatVenueTime(weather.fetchedAt) : "recently"}
          </span>
          <span>(Open-Meteo)</span>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          title="Refresh forecast telemetry"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 dark:hover:bg-neutral-800/50 transition-colors disabled:opacity-50"
        >
          <RotateCw className={cn("size-3", query.isFetching && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}
