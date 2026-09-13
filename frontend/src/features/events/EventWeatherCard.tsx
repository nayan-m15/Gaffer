import { CloudSun, Droplets, Wind } from "lucide-react";
import { useEventWeather } from "./hooks";

interface WeatherEvent {
  id: string;
  scheduledAt: string;
  weatherLocation: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: string | null;
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

  if (query.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading forecast…</p>;
  }
  if (query.isError || weather?.status === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground">
        Forecast temporarily unavailable
      </p>
    );
  }
  if (!weather || weather.status === "not_applicable") return null;
  if (weather.status === "missing_location") {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">
        Confirm the weather location to see a forecast.
      </p>
    );
  }
  if (weather.status === "outside_forecast_range") {
    return (
      <p className="text-xs text-muted-foreground">
        {weather.rangeReason === "too_old"
          ? "Weather history is available for events in the past 5 days."
          : "Forecast available closer to the event"}
      </p>
    );
  }

  const isArchived = Boolean(
    weather.forecastAt && new Date(weather.forecastAt).getTime() < Date.now(),
  );
  const formatVenueTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...(event.weatherTimezone
        ? { timeZone: event.weatherTimezone, timeZoneName: "short" }
        : {}),
    });

  const details = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1 font-medium text-foreground">
        <CloudSun className="size-3.5" aria-hidden="true" />
        {weather.temperatureC != null
          ? `${Math.round(weather.temperatureC)}°C`
          : weather.condition}
      </span>
      {weather.precipitationProbability != null && (
        <span className="flex items-center gap-1">
          <Droplets className="size-3" aria-hidden="true" />
          Rain chance {Math.round(weather.precipitationProbability)}%
        </span>
      )}
      {weather.windSpeedKmh != null && (
        <span className="flex items-center gap-1">
          <Wind className="size-3" aria-hidden="true" />
          {Math.round(weather.windSpeedKmh)} km/h
        </span>
      )}
      {compact && weather.stale && <span>Cached</span>}
    </div>
  );

  if (compact) return details;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {isArchived ? "Archived forecast" : "Weather at event time"}
      </p>
      {event.weatherLocation && (
        <p className="mb-2 text-xs text-muted-foreground">
          Forecast area: {event.weatherLocation}
        </p>
      )}
      {details}
      {weather.forecastAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Forecast time: {formatVenueTime(weather.forecastAt)}
        </p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {weather.stale ? "Stale cached forecast" : isArchived ? "Archived forecast" : "Forecast"}
        {weather.fetchedAt
          ? ` · Last updated ${formatVenueTime(weather.fetchedAt)}`
          : ""}
        {" · "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary hover:underline"
        >
          Weather data by Open-Meteo
        </a>
      </p>
    </div>
  );
}
