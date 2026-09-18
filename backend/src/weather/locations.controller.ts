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

@Controller('locations')
@UseGuards(AuthGuard)
export class LocationsController {
  @Get('search')
  async search(@Query('q') query?: string) {
    const term = query?.trim();
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
}
