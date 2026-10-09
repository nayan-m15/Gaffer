import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { LocationsController } from './locations.controller';

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: () => Promise.resolve(body) }) as Response;

const ENV_NAMES = [
  'GEOCODING_API_URL',
  'REVERSE_GEOCODING_API_URL',
  'GEOCODING_USER_AGENT',
] as const;

describe('LocationsController', () => {
  let controller: LocationsController;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    // A fresh controller per test keeps the reverse-lookup cache and the
    // one-request-per-second throttle from leaking between cases.
    controller = new LocationsController();
    fetchMock = jest.spyOn(globalThis, 'fetch');
    for (const name of ENV_NAMES) delete process.env[name];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of ENV_NAMES) delete process.env[name];
  });

  describe('search', () => {
    it.each([
      undefined,
      ['Johannesburg', 'Pretoria'],
      { city: 'Johannesburg' },
    ])('rejects a non-string location query: %p', async (query) => {
      await expect(controller.search(query)).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each(['', '  ', 'Jo', ' ab '])(
      'rejects a query that is too short: %p',
      async (query) => {
        await expect(controller.search(query)).rejects.toThrow(
          BadRequestException,
        );
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('rejects a query longer than 200 characters', async () => {
      await expect(controller.search('a'.repeat(201))).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps geocoder results to the public place shape', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          results: [
            {
              id: 993800,
              name: 'Johannesburg',
              latitude: -26.2,
              longitude: 28.05,
              timezone: 'Africa/Johannesburg',
              country: 'South Africa',
              admin1: 'Gauteng',
            },
          ],
        }),
      );

      await expect(controller.search('Johannesburg')).resolves.toEqual([
        {
          id: '993800',
          name: 'Johannesburg',
          displayName: 'Johannesburg, Gauteng, South Africa',
          latitude: -26.2,
          longitude: 28.05,
          timezone: 'Africa/Johannesburg',
        },
      ]);
    });

    it('omits absent name parts and defaults a missing timezone to null', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          results: [{ id: 1, name: 'Nowhere', latitude: 0, longitude: 0 }],
        }),
      );

      await expect(controller.search('Nowhere')).resolves.toEqual([
        {
          id: '1',
          name: 'Nowhere',
          displayName: 'Nowhere',
          latitude: 0,
          longitude: 0,
          timezone: null,
        },
      ]);
    });

    it('returns an empty list when the geocoder reports no matches', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await expect(controller.search('Atlantis')).resolves.toEqual([]);
    });

    it('trims the term and sends it to the configured geocoder', async () => {
      process.env.GEOCODING_API_URL = 'https://geo.test/search';
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

      await controller.search('  Durban  ');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('https://geo.test/search?');
      expect(url).toContain('name=Durban');
      expect(url).toContain('count=5');
    });

    it('reports a rejected geocoder request as unavailable', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false));

      await expect(controller.search('Cape Town')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('reports a network failure as unavailable rather than leaking it', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      await expect(controller.search('Cape Town')).rejects.toThrow(
        'Location search is temporarily unavailable.',
      );
    });
  });

  describe('reverse', () => {
    it.each([
      ['not-a-number', '28.05'],
      ['-26.2', 'not-a-number'],
      ['91', '28.05'],
      ['-91', '28.05'],
      ['-26.2', '181'],
      ['-26.2', '-181'],
    ])('rejects out-of-range coordinates: %p, %p', async (lat, lon) => {
      await expect(controller.reverse(lat, lon)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [undefined, '28.05'],
      ['-26.2', undefined],
      [{ lat: 1 }, '28.05'],
    ])('rejects non-string coordinates: %p, %p', async (lat, lon) => {
      await expect(controller.reverse(lat, lon)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts the boundary coordinates', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ place_id: 7, address: { city: 'Edge' } }),
      );

      await expect(controller.reverse('90', '180')).resolves.toMatchObject({
        name: 'Edge',
      });
    });

    it('builds a place from the reverse geocoder address', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          place_id: 123,
          lat: '-26.2041',
          lon: '28.0473',
          address: {
            city: 'Johannesburg',
            state: 'Gauteng',
            country: 'South Africa',
          },
        }),
      );

      await expect(controller.reverse('-26.2', '28.05')).resolves.toEqual({
        id: 'reverse:123',
        name: 'Johannesburg',
        displayName: 'Johannesburg, Gauteng, South Africa',
        latitude: -26.2041,
        longitude: 28.0473,
        timezone: null,
      });
    });

    it.each([
      [{ town: 'Stellenbosch' }, 'Stellenbosch'],
      [{ village: 'Franschhoek' }, 'Franschhoek'],
      [{ municipality: 'Overstrand' }, 'Overstrand'],
      [{ county: 'Overberg' }, 'Overberg'],
      [{ state: 'Western Cape' }, 'Western Cape'],
    ])(
      'falls back through the address hierarchy: %p',
      async (address, name) => {
        fetchMock.mockResolvedValue(jsonResponse({ place_id: 1, address }));

        await expect(controller.reverse('-34', '19')).resolves.toMatchObject({
          name,
        });
      },
    );

    it('does not repeat a name that is also the state in the display name', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          place_id: 5,
          address: { state: 'Gauteng', country: 'South Africa' },
        }),
      );

      await expect(controller.reverse('-26', '28')).resolves.toMatchObject({
        displayName: 'Gauteng, South Africa',
      });
    });

    it('falls back to the requested coordinates when the body omits them', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ address: { city: 'Durban' } }),
      );

      await expect(
        controller.reverse('-29.85', '31.02'),
      ).resolves.toMatchObject({
        id: 'reverse:-29.850,31.020',
        latitude: -29.85,
        longitude: 31.02,
      });
    });

    it('ignores unparseable coordinates in the response body', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          lat: 'north',
          lon: 'east',
          address: { city: 'Durban' },
        }),
      );

      await expect(
        controller.reverse('-29.85', '31.02'),
      ).resolves.toMatchObject({ latitude: -29.85, longitude: 31.02 });
    });

    it('serves a repeated lookup from cache without calling the geocoder again', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ place_id: 9, address: { city: 'Pretoria' } }),
      );

      const first = await controller.reverse('-25.7479', '28.2293');
      // Rounded to three decimals, so a nearby point shares the cache key.
      const second = await controller.reverse('-25.74791', '28.22931');

      expect(second).toBe(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends the configured endpoint and user agent', async () => {
      process.env.REVERSE_GEOCODING_API_URL = 'https://reverse.test/lookup';
      process.env.GEOCODING_USER_AGENT = 'TestAgent/9.9';
      fetchMock.mockResolvedValue(
        jsonResponse({ place_id: 1, address: { city: 'Durban' } }),
      );

      await controller.reverse('-29.85', '31.02');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('https://reverse.test/lookup?');
      expect((init.headers as Record<string, string>)['User-Agent']).toBe(
        'TestAgent/9.9',
      );
    });

    it('reports an address with no town or city as unavailable', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ place_id: 1, address: { country: 'South Africa' } }),
      );

      await expect(controller.reverse('-29.85', '31.02')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('reports a missing address block as unavailable', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ place_id: 1 }));

      await expect(controller.reverse('-29.85', '31.02')).rejects.toThrow(
        'Could not find a nearby town or city. You can enter a place manually.',
      );
    });

    it('reports a rejected reverse request as unavailable', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false));

      await expect(controller.reverse('-29.85', '31.02')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('does not cache a failed lookup', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ place_id: 2, address: { city: 'Durban' } }),
      );
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);

      await expect(controller.reverse('-29.85', '31.02')).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(
        controller.reverse('-29.85', '31.02'),
      ).resolves.toMatchObject({ name: 'Durban' });
    });
  });
});
