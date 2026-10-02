import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

interface GeocodingResponse {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    timezone?: string;
    country?: string;
    admin1?: string;
  }>;
}

interface ReverseGeocodingResponse {
  place_id?: number;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

@Controller('locations')
@UseGuards(AuthGuard)
export class LocationsController {
  private readonly reverseCache = new Map<
    string,
    {
      id: string;
      name: string;
      displayName: string;
      latitude: number;
      longitude: number;
      timezone: null;
    }
  >();
  private lastReverseRequestAt = 0;
  private reverseRequestQueue: Promise<void> = Promise.resolve();

  @Get('search')
  async search(@Query('q') query: unknown) {
    const term = typeof query === 'string' ? query.trim() : '';
    if (!term || term.length < 3 || term.length > 200) {
      throw new BadRequestException(
        'Enter at least 3 characters to search for a location.',
      );
    }
    const baseUrl =
      process.env.GEOCODING_API_URL ??
      'https://geocoding-api.open-meteo.com/v1/search';
    const params = new URLSearchParams({
      name: term,
      count: '5',
      language: 'en',
      format: 'json',
    });
    try {
      const response = await fetch(`${baseUrl}?${params}`, {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Geocoder rejected the request');
      const body = (await response.json()) as GeocodingResponse;
      return (body.results ?? []).map((place) => ({
        id: String(place.id),
        name: place.name,
        displayName: [place.name, place.admin1, place.country]
          .filter(Boolean)
          .join(', '),
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone ?? null,
      }));
    } catch {
      throw new ServiceUnavailableException(
        'Location search is temporarily unavailable.',
      );
    }
  }

  @Get('reverse')
  async reverse(
    @Query('lat') latitudeQuery: unknown,
    @Query('lon') longitudeQuery: unknown,
  ) {
    const latitude = typeof latitudeQuery === 'string' ? Number(latitudeQuery) : NaN;
    const longitude = typeof longitudeQuery === 'string' ? Number(longitudeQuery) : NaN;
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Enter valid latitude and longitude coordinates.');
    }

    const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cached = this.reverseCache.get(cacheKey);
    if (cached) return cached;

    // Nominatim's public service asks applications to stay below one request
    // per second. Current-location lookup is user-triggered and cached here.
    const queuedRequest = this.reverseRequestQueue.then(async () => {
      const waitMs = Math.max(
        0,
        1_100 - (Date.now() - this.lastReverseRequestAt),
      );
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.lastReverseRequestAt = Date.now();
    });
    this.reverseRequestQueue = queuedRequest.catch(() => undefined);
    await queuedRequest;

    const baseUrl =
      process.env.REVERSE_GEOCODING_API_URL ??
      'https://nominatim.openstreetmap.org/reverse';
    const params = new URLSearchParams({
      lat: String(latitude), lon: String(longitude), format: 'jsonv2',
      zoom: '10', addressdetails: '1', layer: 'address',
    });
    try {
      const response = await fetch(`${baseUrl}?${params}`, {
        signal: AbortSignal.timeout(5_000),
        headers: {
          Accept: 'application/json',
          'User-Agent':
            process.env.GEOCODING_USER_AGENT ??
            'SportCoachingTool/1.0 (event location lookup)',
        },
      });
      if (!response.ok) throw new Error('Reverse geocoder rejected the request');
      const body = (await response.json()) as ReverseGeocodingResponse;
      const address = body.address ?? {};
      const name =
        address.city ??
        address.town ??
        address.village ??
        address.municipality ??
        address.county ??
        address.state;
      if (!name) throw new Error('No nearby town or city found');
      const place = {
        id: `reverse:${body.place_id ?? cacheKey}`,
        name,
        displayName: [name, address.state, address.country]
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .join(', '),
        latitude: Number.isFinite(Number(body.lat))
          ? Number(body.lat)
          : latitude,
        longitude: Number.isFinite(Number(body.lon))
          ? Number(body.lon)
          : longitude,
        timezone: null as null,
      };
      this.reverseCache.set(cacheKey, place);
      return place;
    } catch {
      throw new ServiceUnavailableException(
        'Could not find a nearby town or city. You can enter a place manually.',
      );
    }
  }
}
