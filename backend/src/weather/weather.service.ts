import { Injectable, Logger, Optional } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { weatherForecastCache } from '../database/schema';

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
  temperatureMinC?: number;
  temperatureMaxC?: number;
  humidity?: number;
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
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  location?: string | null;
  weatherLocation?: string | null;
}

type WeatherProvider = 'open-meteo' | 'met-norway';

interface HourlyForecast {
  time: string[];
  temperature: (number | null)[];
  precipitationProbability: (number | null)[];
  windSpeed: (number | null)[];
  weatherCode: (number | null)[];
  humidity?: (number | null)[];
}

interface CachedForecastDay {
  expiresAt: number;
  fetchedAt: string;
  provider: WeatherProvider;
  hourly: HourlyForecast;
}

interface OpenMeteoForecast {
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    wind_speed_10m?: unknown;
    weather_code?: unknown;
    relative_humidity_2m?: unknown;
  };
}

interface MetNorwayResponse {
  properties?: {
    timeseries?: Array<{
      time?: string;
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            wind_speed?: number;
            relative_humidity?: number;
          };
        };
        next_1_hours?: {
          summary?: { symbol_code?: string };
          details?: {
            probability_of_precipitation?: number;
            precipitation_amount?: number;
          };
        };
        next_6_hours?: {
          summary?: { symbol_code?: string };
          details?: {
            probability_of_precipitation?: number;
            precipitation_amount?: number;
          };
        };
      };
    }>;
  };
}

interface GeocodingResponse {
  results?: Array<{
    latitude: number;
    longitude: number;
  }>;
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

const REQUEST_TIMEOUT_MS = 10_000;
const COMPLETED_STALE_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, CachedForecastDay>();
  private readonly inFlight = new Map<string, Promise<CachedForecastDay>>();
  private readonly geocodeCache = new Map<
    string,
    { latitude: number; longitude: number } | null
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
  private readonly metNorwayUrl =
    process.env.WEATHER_FALLBACK_API_URL ??
    'https://api.met.no/weatherapi/locationforecast/2.0/compact';
  private readonly geocodingUrl =
    process.env.GEOCODING_API_URL ??
    'https://geocoding-api.open-meteo.com/v1/search';

  constructor(
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  async getEventWeather(event: ForecastEvent): Promise<EventWeather> {
    if (event.status === 'cancelled') return { status: 'not_applicable' };

    const coords = await this.resolveCoordinates(event);
    if (!coords) {
      return { status: 'missing_location' };
    }

    const eventHour = new Date(event.scheduledAt);
    eventHour.setUTCMinutes(0, 0, 0);
    const rangeStatus = this.getRangeStatus(eventHour);
    if (rangeStatus) return rangeStatus;

    const date = eventHour.toISOString().slice(0, 10);
    const key = [
      coords.latitude.toFixed(2),
      coords.longitude.toFixed(2),
      date,
    ].join(':');

    const cached =
      this.cache.get(key) ?? (await this.readDbCache(key));
    if (cached && !this.cache.has(key)) {
      this.setMemoryCache(key, cached);
    }

    let forecastDay: CachedForecastDay;
    let stale = false;
    const now = Date.now();
    const isFresh =
      cached !== undefined &&
      cached.expiresAt > now &&
      this.findValidHourIndex(cached.hourly, eventHour) >= 0;

    try {
      forecastDay = isFresh
        ? cached
        : await this.getOrFetchDay(
            key,
            coords.latitude,
            coords.longitude,
            date,
            eventHour,
          );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Weather fetch failed for ${key} (${event.status}): ${reason}`,
      );
      const staleWindowMs =
        event.status === 'completed' || eventHour.getTime() < now
          ? COMPLETED_STALE_MS
          : this.maximumStaleMs;
      if (
        !cached ||
        cached.expiresAt + staleWindowMs <= now ||
        this.findValidHourIndex(cached.hourly, eventHour) < 0
      ) {
        return { status: 'unavailable' };
      }
      forecastDay = cached;
      stale = true;
    }

    const index = this.findValidHourIndex(forecastDay.hourly, eventHour);
    if (index < 0) return { status: 'unavailable' };

    const temperatureC = forecastDay.hourly.temperature[index] as number;
    const precipitationProbability =
      forecastDay.hourly.precipitationProbability[index] as number;
    const windSpeedKmh = forecastDay.hourly.windSpeed[index] as number;
    const weatherCode = forecastDay.hourly.weatherCode[index] as number;
    const rawHumidity = forecastDay.hourly.humidity?.[index];
    const humidity =
      typeof rawHumidity === 'number' && Number.isFinite(rawHumidity)
        ? rawHumidity
        : undefined;
    const validTemps = forecastDay.hourly.temperature.filter(
      (t): t is number => typeof t === 'number' && Number.isFinite(t),
    );
    const temperatureMinC =
      validTemps.length > 0 ? Math.min(...validTemps) : undefined;
    const temperatureMaxC =
      validTemps.length > 0 ? Math.max(...validTemps) : undefined;

    return {
      status: 'available',
      forecastAt: eventHour.toISOString(),
      fetchedAt: forecastDay.fetchedAt,
      temperatureC,
      ...(temperatureMinC !== undefined ? { temperatureMinC } : {}),
      ...(temperatureMaxC !== undefined ? { temperatureMaxC } : {}),
      ...(humidity !== undefined ? { humidity } : {}),
      precipitationProbability,
      windSpeedKmh,
      weatherCode,
      condition: CONDITIONS[weatherCode] ?? 'Forecast available',
      stale,
      attribution:
        forecastDay.provider === 'met-norway'
          ? 'Weather data by MET Norway'
          : 'Weather data by Open-Meteo',
    };
  }

  private async resolveCoordinates(
    event: ForecastEvent,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (event.weatherLatitude != null && event.weatherLongitude != null) {
      return {
        latitude: event.weatherLatitude,
        longitude: event.weatherLongitude,
      };
    }

    const rawLocation = (event.weatherLocation ?? event.location ?? '').trim();
    if (rawLocation.length < 3 || rawLocation.length > 200) {
      return null;
    }

    const cacheKey = rawLocation.toLowerCase();
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey) ?? null;
    }

    try {
      const params = new URLSearchParams({
        name: rawLocation,
        count: '1',
        language: 'en',
        format: 'json',
      });
      const response = await fetch(`${this.geocodingUrl}?${params.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        this.logger.warn(
          `Fallback geocoding returned ${response.status} for "${rawLocation}"`,
        );
        return null;
      }
      const body = (await response.json()) as GeocodingResponse;
      const first = body.results?.[0];
      if (
        !first ||
        !Number.isFinite(first.latitude) ||
        !Number.isFinite(first.longitude)
      ) {
        this.geocodeCache.set(cacheKey, null);
        return null;
      }
      const coords = {
        latitude: first.latitude,
        longitude: first.longitude,
      };
      this.geocodeCache.set(cacheKey, coords);
      return coords;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Fallback geocoding failed for "${rawLocation}": ${reason}`,
      );
      return null;
    }
  }

  private getRangeStatus(eventHour: Date): EventWeather | null {
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
    return null;
  }

  private getOrFetchDay(
    key: string,
    latitude: number,
    longitude: number,
    date: string,
    eventHour: Date,
  ): Promise<CachedForecastDay> {
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.fetchDayWithFallback(
      latitude,
      longitude,
      date,
      eventHour,
    )
      .then(async (forecastDay) => {
        this.setMemoryCache(key, forecastDay);
        await this.writeDbCache(key, forecastDay);
        return forecastDay;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchDayWithFallback(
    latitude: number,
    longitude: number,
    date: string,
    eventHour: Date,
  ): Promise<CachedForecastDay> {
    try {
      const primary = await this.fetchOpenMeteoDay(latitude, longitude, date);
      if (this.findValidHourIndex(primary.hourly, eventHour) < 0) {
        throw new Error(
          `Open-Meteo response missing valid data for ${eventHour.toISOString()}.`,
        );
      }
      return primary;
    } catch (primaryError) {
      const reason =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      this.logger.warn(
        `Open-Meteo failed (${reason}); trying MET Norway fallback for ${date}`,
      );
      const fallback = await this.fetchMetNorwayDay(latitude, longitude, date);
      if (this.findValidHourIndex(fallback.hourly, eventHour) < 0) {
        throw primaryError;
      }
      return fallback;
    }
  }

  private async fetchOpenMeteoDay(
    latitude: number,
    longitude: number,
    date: string,
  ): Promise<CachedForecastDay> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly:
        'temperature_2m,precipitation_probability,wind_speed_10m,weather_code,relative_humidity_2m',
      timezone: 'UTC',
      start_date: date,
      end_date: date,
    });
    const response = await fetch(this.forecastUrl + '?' + params.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Weather provider returned ' + response.status + '.');
    }

    const hourly = this.parseHourly(
      (await response.json()) as OpenMeteoForecast,
    );
    return {
      expiresAt: Date.now() + this.cacheMs,
      fetchedAt: new Date().toISOString(),
      provider: 'open-meteo',
      hourly,
    };
  }

  private async fetchMetNorwayDay(
    latitude: number,
    longitude: number,
    date: string,
  ): Promise<CachedForecastDay> {
    const params = new URLSearchParams({
      lat: latitude.toFixed(4),
      lon: longitude.toFixed(4),
    });
    const response = await fetch(`${this.metNorwayUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent':
          process.env.WEATHER_USER_AGENT ??
          'GafferApp/1.0 (https://github.com/gaffer)',
      },
    });
    if (!response.ok) {
      throw new Error(
        'Fallback weather provider returned ' + response.status + '.',
      );
    }

    const body = (await response.json()) as MetNorwayResponse;
    const timeseries = body.properties?.timeseries ?? [];
    const dayEntries = timeseries.filter(
      (entry) => typeof entry.time === 'string' && entry.time.startsWith(date),
    );
    if (dayEntries.length === 0) {
      throw new Error(`MET Norway returned no entries for ${date}.`);
    }

    const time: string[] = [];
    const temperature: (number | null)[] = [];
    const precipitationProbability: (number | null)[] = [];
    const windSpeed: (number | null)[] = [];
    const weatherCode: (number | null)[] = [];
    const humidity: (number | null)[] = [];

    for (const entry of dayEntries) {
      if (!entry.time) continue;
      const instant = entry.data?.instant?.details;
      const nextPeriod = entry.data?.next_1_hours ?? entry.data?.next_6_hours;
      const temp = instant?.air_temperature;
      const windMs = instant?.wind_speed;
      const symbol = nextPeriod?.summary?.symbol_code;
      const precipProb =
        nextPeriod?.details?.probability_of_precipitation ??
        ((nextPeriod?.details?.precipitation_amount ?? 0) > 0 ? 70 : 0);

      time.push(entry.time.slice(0, 16));
      temperature.push(
        typeof temp === 'number' && Number.isFinite(temp) ? temp : null,
      );
      windSpeed.push(
        typeof windMs === 'number' && Number.isFinite(windMs)
          ? Math.round(windMs * 3.6 * 10) / 10
          : null,
      );
      precipitationProbability.push(
        typeof precipProb === 'number' && Number.isFinite(precipProb)
          ? precipProb
          : null,
      );
      weatherCode.push(this.mapMetSymbolToWmoCode(symbol));
      const relHumidity = instant?.relative_humidity;
      humidity.push(
        typeof relHumidity === 'number' && Number.isFinite(relHumidity)
          ? relHumidity
          : null,
      );
    }

    return {
      expiresAt: Date.now() + this.cacheMs,
      fetchedAt: new Date().toISOString(),
      provider: 'met-norway',
      hourly: {
        time,
        temperature,
        precipitationProbability,
        windSpeed,
        weatherCode,
        humidity,
      },
    };
  }

  private mapMetSymbolToWmoCode(symbol: string | undefined): number | null {
    if (!symbol) return 2;
    const base = symbol.split('_')[0];
    if (base.includes('thunder')) return 95;
    if (base === 'clearsky') return 0;
    if (base === 'fair') return 1;
    if (base === 'partlycloudy') return 2;
    if (base === 'cloudy') return 3;
    if (base === 'fog') return 45;
    if (base.includes('heavyrainshowers')) return 82;
    if (base.includes('lightrainshowers')) return 80;
    if (base.includes('rainshowers')) return 81;
    if (base.includes('heavyrain')) return 65;
    if (base.includes('lightrain')) return 61;
    if (base.includes('rain')) return 63;
    if (base.includes('heavysnow')) return 75;
    if (base.includes('lightsnow')) return 71;
    if (base.includes('snow')) return 73;
    if (base.includes('sleet')) return 66;
    return 2;
  }

  private parseHourly(body: OpenMeteoForecast): HourlyForecast {
    const time = body.hourly?.time;
    const temperature = body.hourly?.temperature_2m;
    const precipitationProbability = body.hourly?.precipitation_probability;
    const windSpeed = body.hourly?.wind_speed_10m;
    const weatherCode = body.hourly?.weather_code;
    const humidity = body.hourly?.relative_humidity_2m;
    if (
      !this.isStringArray(time) ||
      !this.isNullableNumberArray(temperature) ||
      !this.isNullableNumberArray(precipitationProbability) ||
      !this.isNullableNumberArray(windSpeed) ||
      !this.isNullableNumberArray(weatherCode) ||
      time.length === 0 ||
      [temperature, precipitationProbability, windSpeed, weatherCode].some(
        (values) => values.length !== time.length,
      )
    ) {
      throw new Error('Weather provider returned incomplete hourly data.');
    }
    return {
      time,
      temperature,
      precipitationProbability,
      windSpeed,
      weatherCode,
      ...(this.isNullableNumberArray(humidity) &&
      humidity.length === time.length
        ? { humidity }
        : {}),
    };
  }

  private findValidHourIndex(
    hourly: HourlyForecast,
    eventHour: Date,
  ): number {
    const targetMs = eventHour.getTime();
    const index = hourly.time.findIndex(
      (time) => new Date(time + ':00Z').getTime() === targetMs,
    );
    if (index < 0) return -1;
    const required = [
      hourly.temperature[index],
      hourly.precipitationProbability[index],
      hourly.windSpeed[index],
      hourly.weatherCode[index],
    ];
    return required.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
      ? index
      : -1;
  }

  private setMemoryCache(key: string, forecastDay: CachedForecastDay): void {
    if (this.cache.size >= 500) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, forecastDay);
  }

  private async readDbCache(
    key: string,
  ): Promise<CachedForecastDay | undefined> {
    if (!this.databaseService) return undefined;
    try {
      const rows = await this.databaseService.database
        .select()
        .from(weatherForecastCache)
        .where(eq(weatherForecastCache.cacheKey, key))
        .limit(1);
      const row = rows[0];
      if (!row) return undefined;
      return {
        expiresAt: row.expiresAt.getTime(),
        fetchedAt: row.fetchedAt.toISOString(),
        provider:
          row.provider === 'met-norway' ? 'met-norway' : 'open-meteo',
        hourly: row.hourly,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to read weather DB cache for ${key}: ${reason}`);
      return undefined;
    }
  }

  private async writeDbCache(
    key: string,
    forecastDay: CachedForecastDay,
  ): Promise<void> {
    if (!this.databaseService) return;
    try {
      const expiresAt = new Date(forecastDay.expiresAt);
      const fetchedAt = new Date(forecastDay.fetchedAt);
      await this.databaseService.database
        .insert(weatherForecastCache)
        .values({
          cacheKey: key,
          expiresAt,
          fetchedAt,
          provider: forecastDay.provider,
          hourly: forecastDay.hourly,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: weatherForecastCache.cacheKey,
          set: {
            expiresAt,
            fetchedAt,
            provider: forecastDay.provider,
            hourly: forecastDay.hourly,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to write weather DB cache for ${key}: ${reason}`);
    }
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isNullableNumberArray(value: unknown): value is (number | null)[] {
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          item === null || (typeof item === 'number' && Number.isFinite(item)),
      )
    );
  }
}
