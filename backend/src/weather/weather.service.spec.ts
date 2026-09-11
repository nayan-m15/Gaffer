import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  const originalFetch = global.fetch;
  const originalCacheMinutes = process.env.WEATHER_CACHE_MINUTES;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalCacheMinutes === undefined) {
      delete process.env.WEATHER_CACHE_MINUTES;
    } else {
      process.env.WEATHER_CACHE_MINUTES = originalCacheMinutes;
    }
    jest.restoreAllMocks();
  });

  it('does not call the provider without confirmed coordinates', async () => {
    global.fetch = jest.fn();
    const service = new WeatherService();

    await expect(
      service.getEventWeather({
        scheduledAt: new Date(Date.now() + 86_400_000),
        status: 'scheduled',
        weatherLatitude: null,
        weatherLongitude: null,
      }),
    ).resolves.toEqual({ status: 'missing_location' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('selects the UTC forecast hour for a completed event in the recent past', async () => {
    const scheduledAt = new Date(Date.now() - 2 * 86_400_000);
    scheduledAt.setUTCMinutes(25, 0, 0);
    const hour = new Date(scheduledAt);
    hour.setUTCMinutes(0, 0, 0);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          hourly: {
            time: [hour.toISOString().slice(0, 16)],
            temperature_2m: [21.4],
            precipitation_probability: [30],
            wind_speed_10m: [12.2],
            weather_code: [2],
          },
        }),
    });

    const result = await new WeatherService().getEventWeather({
      scheduledAt,
      status: 'completed',
      weatherLatitude: -26.2,
      weatherLongitude: 28.04,
    });

    expect(result).toMatchObject({
      status: 'available',
      forecastAt: hour.toISOString(),
      temperatureC: 21.4,
      precipitationProbability: 30,
      windSpeedKmh: 12.2,
      condition: 'Partly cloudy',
    });
  });

  it('selects the correct UTC hour across a venue timezone boundary', async () => {
    const scheduledAt = new Date('2026-09-12T00:30:00+02:00');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          hourly: {
            time: ['2026-09-11T22:00'],
            temperature_2m: [17],
            precipitation_probability: [5],
            wind_speed_10m: [8],
            weather_code: [0],
          },
        }),
    });

    const result = await new WeatherService().getEventWeather({
      scheduledAt,
      status: 'scheduled',
      weatherLatitude: -26.2,
      weatherLongitude: 28.04,
    });

    expect(result).toMatchObject({
      status: 'available',
      forecastAt: '2026-09-11T22:00:00.000Z',
      temperatureC: 17,
    });
  });

  it('classifies events beyond 16 forecast days without calling the provider', async () => {
    global.fetch = jest.fn();
    const scheduledAt = new Date();
    scheduledAt.setUTCHours(0, 0, 0, 0);
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 16);

    await expect(
      new WeatherService().getEventWeather({
        scheduledAt,
        status: 'scheduled',
        weatherLatitude: -26.2,
        weatherLongitude: 28.04,
      }),
    ).resolves.toEqual({
      status: 'outside_forecast_range',
      rangeReason: 'too_far',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('classifies events older than the five-day history window', async () => {
    global.fetch = jest.fn();
    const scheduledAt = new Date();
    scheduledAt.setUTCHours(23, 0, 0, 0);
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() - 6);

    await expect(
      new WeatherService().getEventWeather({
        scheduledAt,
        status: 'completed',
        weatherLatitude: -26.2,
        weatherLongitude: 28.04,
      }),
    ).resolves.toEqual({
      status: 'outside_forecast_range',
      rangeReason: 'too_old',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shares one location-day request across concurrent event hours', async () => {
    const morning = new Date();
    morning.setUTCDate(morning.getUTCDate() + 1);
    morning.setUTCHours(10, 0, 0, 0);
    const afternoon = new Date(morning);
    afternoon.setUTCHours(15);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          hourly: {
            time: [
              morning.toISOString().slice(0, 16),
              afternoon.toISOString().slice(0, 16),
            ],
            temperature_2m: [18, 23],
            precipitation_probability: [20, 10],
            wind_speed_10m: [9, 14],
            weather_code: [2, 1],
          },
        }),
    });
    const service = new WeatherService();
    const baseEvent = {
      status: 'scheduled',
      weatherLatitude: -26.2,
      weatherLongitude: 28.04,
    };

    const [morningWeather, afternoonWeather] = await Promise.all([
      service.getEventWeather({ ...baseEvent, scheduledAt: morning }),
      service.getEventWeather({ ...baseEvent, scheduledAt: afternoon }),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(morningWeather).toMatchObject({ temperatureC: 18 });
    expect(afternoonWeather).toMatchObject({ temperatureC: 23 });
  });

  it('uses a recent cached day after an HTTP provider failure', async () => {
    process.env.WEATHER_CACHE_MINUTES = '0';
    const scheduledAt = new Date();
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
    scheduledAt.setUTCHours(12, 0, 0, 0);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            hourly: {
              time: [scheduledAt.toISOString().slice(0, 16)],
              temperature_2m: [20],
              precipitation_probability: [15],
              wind_speed_10m: [11],
              weather_code: [1],
            },
          }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const service = new WeatherService();
    const event = {
      scheduledAt,
      status: 'scheduled',
      weatherLatitude: -26.2,
      weatherLongitude: 28.04,
    };

    await service.getEventWeather(event);
    const cached = await service.getEventWeather(event);

    expect(cached).toMatchObject({ status: 'available', stale: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects incomplete provider payloads as unavailable', async () => {
    const scheduledAt = new Date();
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hourly: { time: [] } }),
    });

    await expect(
      new WeatherService().getEventWeather({
        scheduledAt,
        status: 'scheduled',
        weatherLatitude: -26.2,
        weatherLongitude: 28.04,
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns unavailable when a network failure has no cached response', async () => {
    const scheduledAt = new Date();
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(
      new WeatherService().getEventWeather({
        scheduledAt,
        status: 'scheduled',
        weatherLatitude: -26.2,
        weatherLongitude: 28.04,
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
