import { CloudSun, Droplets, Wind } from "lucide-react";
import { useEventWeather } from "./hooks";

export function EventWeatherCard({ eventId, enabled = true, compact = false }: {
  eventId: string;
  enabled?: boolean;
  compact?: boolean;
}) {
  const query = useEventWeather(eventId, enabled);
  const weather = query.data;

  if (query.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading forecast…</p>;
  }
  if (query.isError || weather?.status === "unavailable") {
    return <p className="text-xs text-muted-foreground">Forecast temporarily unavailable</p>;
  }
  if (!weather || weather.status === "not_applicable") return null;
  if (weather.status === "missing_location") {
    return compact ? null : <p className="text-xs text-muted-foreground">Confirm the weather location to see a forecast.</p>;
  }
  if (weather.status === "outside_forecast_range") {
    if (compact) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {weather.rangeReason === "too_old"
          ? "Weather history is available for events in the past 5 days."
          : "Forecast will appear closer to the event."}
      </p>
    );
  }

  const details = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1 font-medium text-foreground">
        <CloudSun className="size-3.5" aria-hidden="true" />
        {weather.condition}{weather.temperatureC != null ? ` · ${Math.round(weather.temperatureC)}°C` : ""}
      </span>
      {weather.precipitationProbability != null && (
        <span className="flex items-center gap-1"><Droplets className="size-3" />{Math.round(weather.precipitationProbability)}%</span>
      )}
      {!compact && weather.windSpeedKmh != null && (
        <span className="flex items-center gap-1"><Wind className="size-3" />{Math.round(weather.windSpeedKmh)} km/h</span>
      )}
    </div>
  );

  if (compact) return details;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Weather at event time</p>
      {details}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {weather.forecastAt ? `Weather for ${new Date(weather.forecastAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "Weather"}
        {weather.stale ? " · cached" : ""} · {weather.attribution}
      </p>
    </div>
  );
}
