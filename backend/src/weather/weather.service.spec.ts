import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call the provider without confirmed coordinates', async () => {
    global.fetch = jest.fn();
    const service = new WeatherService();

    await expect(
      service.getEventWeather({
        scheduledAt: new Date(Date.now() + 86_400_000),
        status: 'scheduled',
        latitude: null,
        longitude: null,
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
      latitude: -26.2,
      longitude: 28.04,
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

  it('classifies events beyond 16 forecast days without calling the provider', async () => {
    global.fetch = jest.fn();
    const scheduledAt = new Date();
    scheduledAt.setUTCHours(0, 0, 0, 0);
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 16);

    await expect(
      new WeatherService().getEventWeather({
        scheduledAt,
        status: 'scheduled',
        latitude: -26.2,
        longitude: 28.04,
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
        latitude: -26.2,
        longitude: 28.04,
      }),
    ).resolves.toEqual({
      status: 'outside_forecast_range',
      rangeReason: 'too_old',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
