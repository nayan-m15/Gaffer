import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { zodValidate } from '../common/zod-validate';
import { publicResourceQuerySchema } from './public-api.schemas';
import { PublicApiService } from './public-api.service';

const FORMATIONS_EXAMPLE = {
  success: true,
  count: 2,
  data: [
    {
      id: '4-3-3',
      name: '4-3-3',
      shape: '4-3-3',
      description:
        'A balanced formation with width in attack and a three-player midfield that can dominate possession.',
    },
    {
      id: '4-4-2',
      name: '4-4-2',
      shape: '4-4-2',
      description:
        'A classic, compact shape with two flat banks of four and two strikers who support each other up front.',
    },
  ],
};

/**
 * Public, unauthenticated, read-only reference data on supported football
 * formations. No CORS credentials and no team/user data ever pass through
 * this controller — see `formations.data.ts` for the security rationale.
 */
@ApiTags('Public API')
@Controller('v1/formations')
export class FormationsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  @ApiOperation({
    summary: 'List football formations, or fetch one by id',
    description:
      'Read-only public endpoint — no authentication required. Returns every ' +
      'supported formation, or pass ?id= to fetch a single formation.',
  })
  @ApiQuery({
    name: 'id',
    required: false,
    description: 'Formation id to fetch, e.g. "4-3-3".',
  })
  @ApiOkResponse({
    description: 'Matching formation(s).',
    schema: { example: FORMATIONS_EXAMPLE },
  })
  findAll(@Query() query: unknown) {
    const { id } = zodValidate(publicResourceQuerySchema, query);
    const data = id
      ? [this.publicApiService.getFormation(id)]
      : this.publicApiService.listFormations();

    return { success: true, count: data.length, data };
  }
}
