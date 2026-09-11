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
  weatherLatitude: number | null;
  weatherLongitude: number | null;
}

interface HourlyForecast {
  time: string[];
  temperature: number[];
  precipitationProbability: number[];
  windSpeed: number[];
  weatherCode: number[];
}

interface CachedForecastDay {
  expiresAt: number;
  fetchedAt: string;
  hourly: HourlyForecast;
}

interface OpenMeteoForecast {
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    wind_speed_10m?: unknown;
    weather_code?: unknown;
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
  private readonly cache = new Map<string, CachedForecastDay>();
  private readonly inFlight = new Map<string, Promise<CachedForecastDay>>();
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
    if (event.status === 'cancelled') return { status: 'not_applicable' };
    if (event.weatherLatitude == null || event.weatherLongitude == null) {
      return { status: 'missing_location' };
    }

    const eventHour = new Date(event.scheduledAt);
    eventHour.setUTCMinutes(0, 0, 0);
    const rangeStatus = this.getRangeStatus(eventHour);
    if (rangeStatus) return rangeStatus;

    const date = eventHour.toISOString().slice(0, 10);
    const key = [event.weatherLatitude, event.weatherLongitude, date].join(':');
    const cached = this.cache.get(key);
    let forecastDay: CachedForecastDay;
    let stale = false;

    try {
      forecastDay =
        cached && cached.expiresAt > Date.now()
          ? cached
          : await this.getOrFetchDay(
              key,
              event.weatherLatitude,
              event.weatherLongitude,
              date,
            );
    } catch {
      if (!cached || cached.expiresAt + this.maximumStaleMs <= Date.now()) {
        return { status: 'unavailable' };
      }
      forecastDay = cached;
      stale = true;
    }

    const index = forecastDay.hourly.time.findIndex(
      (time) => new Date(time + ':00Z').getTime() === eventHour.getTime(),
    );
    if (index < 0) return { status: 'unavailable' };

    const weatherCode = forecastDay.hourly.weatherCode[index];
    return {
      status: 'available',
      forecastAt: eventHour.toISOString(),
      fetchedAt: forecastDay.fetchedAt,
      temperatureC: forecastDay.hourly.temperature[index],
      precipitationProbability:
        forecastDay.hourly.precipitationProbability[index],
      windSpeedKmh: forecastDay.hourly.windSpeed[index],
      weatherCode,
      condition: CONDITIONS[weatherCode] ?? 'Forecast available',
      stale,
      attribution: 'Weather data by Open-Meteo',
    };
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
  ): Promise<CachedForecastDay> {
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.fetchDay(latitude, longitude, date)
      .then((forecastDay) => {
        if (this.cache.size >= 500) {
          const oldestKey = this.cache.keys().next().value as
            string | undefined;
          if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(key, forecastDay);
        return forecastDay;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchDay(
    latitude: number,
    longitude: number,
    date: string,
  ): Promise<CachedForecastDay> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly:
        'temperature_2m,precipitation_probability,wind_speed_10m,weather_code',
      timezone: 'UTC',
      start_date: date,
      end_date: date,
    });
    const response = await fetch(this.forecastUrl + '?' + params.toString(), {
      signal: AbortSignal.timeout(5_000),
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
      hourly,
    };
  }

  private parseHourly(body: OpenMeteoForecast): HourlyForecast {
    const time = body.hourly?.time;
    const temperature = body.hourly?.temperature_2m;
    const precipitationProbability = body.hourly?.precipitation_probability;
    const windSpeed = body.hourly?.wind_speed_10m;
    const weatherCode = body.hourly?.weather_code;
    if (
      !this.isStringArray(time) ||
      !this.isNumberArray(temperature) ||
      !this.isNumberArray(precipitationProbability) ||
      !this.isNumberArray(windSpeed) ||
      !this.isNumberArray(weatherCode) ||
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
    };
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isNumberArray(value: unknown): value is number[] {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'number' && Number.isFinite(item))
    );
  }
}
