import { Injectable } from '@nestjs/common';

export type WeatherStatus =
  | 'available'
  | 'missing_location'
  | 'outside_forecast_range'
  | 'unavailable'
  | 'not_applicable';

export interface EventWeather {
  status: WeatherStatus;
  rangeReason?: 'too_old' | 'too_far';
  forecastAt?: string;
  fetchedAt?: string;
  temperatureC?: number;
  precipitationProbability?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  condition?: string;
  stale?: boolean;
  attribution?: string;
}

interface ForecastEvent {
  scheduledAt: Date;
  status: string;
  latitude: number | null;
  longitude: number | null;
}

interface OpenMeteoForecast {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
}

const CONDITIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
};

@Injectable()
export class WeatherService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: EventWeather }
  >();
  private readonly cacheMs =
    Number(process.env.WEATHER_CACHE_MINUTES ?? 30) * 60_000;
  private readonly maximumStaleMs = 6 * 60 * 60_000;
  private readonly historyDays = Number(process.env.WEATHER_HISTORY_DAYS ?? 5);
  private readonly forecastDays = Number(
    process.env.WEATHER_FORECAST_DAYS ?? 16,
  );
  private readonly forecastUrl =
    process.env.WEATHER_API_URL ?? 'https://api.open-meteo.com/v1/forecast';

  async getEventWeather(event: ForecastEvent): Promise<EventWeather> {
    if (event.status === 'cancelled') {
      return { status: 'not_applicable' };
    }
    if (event.latitude == null || event.longitude == null) {
      return { status: 'missing_location' };
    }

    const eventHour = new Date(event.scheduledAt);
    eventHour.setUTCMinutes(0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const earliestDate = new Date(today);
    earliestDate.setUTCDate(earliestDate.getUTCDate() - this.historyDays);
    const latestDate = new Date(today);
    latestDate.setUTCDate(latestDate.getUTCDate() + this.forecastDays);

    if (eventHour < earliestDate) {
      return { status: 'outside_forecast_range', rangeReason: 'too_old' };
    }
    if (eventHour >= latestDate) {
      return { status: 'outside_forecast_range', rangeReason: 'too_far' };
    }

    const key = `${event.latitude}:${event.longitude}:${eventHour.toISOString()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const date = eventHour.toISOString().slice(0, 10);
    const params = new URLSearchParams({
      latitude: String(event.latitude),
      longitude: String(event.longitude),
      hourly:
        'temperature_2m,precipitation_probability,wind_speed_10m,weather_code',
      timezone: 'UTC',
      start_date: date,
      end_date: date,
    });

    try {
      const response = await fetch(`${this.forecastUrl}?${params}`, {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return { status: 'unavailable' };
      const body = (await response.json()) as OpenMeteoForecast;
      const times = body.hourly?.time ?? [];
      const index = times.findIndex(
        (time) => new Date(`${time}:00Z`).getTime() === eventHour.getTime(),
      );
      if (index < 0) return { status: 'outside_forecast_range' };

      const weatherCode = body.hourly?.weather_code?.[index] ?? undefined;
      const value: EventWeather = {
        status: 'available',
        forecastAt: eventHour.toISOString(),
        fetchedAt: new Date().toISOString(),
        temperatureC: body.hourly?.temperature_2m?.[index] ?? undefined,
        precipitationProbability:
          body.hourly?.precipitation_probability?.[index] ?? undefined,
        windSpeedKmh: body.hourly?.wind_speed_10m?.[index] ?? undefined,
        weatherCode,
        condition:
          weatherCode == null
            ? 'Forecast available'
            : (CONDITIONS[weatherCode] ?? 'Forecast available'),
        stale: false,
        attribution: 'Weather data by Open-Meteo',
      };
      if (this.cache.size >= 500) {
        const oldestKey = this.cache.keys().next().value as string | undefined;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(key, { expiresAt: Date.now() + this.cacheMs, value });
      return value;
    } catch {
      if (cached && cached.expiresAt + this.maximumStaleMs > Date.now()) {
        return { ...cached.value, stale: true };
      }
      return { status: 'unavailable' };
    }
  }
}
