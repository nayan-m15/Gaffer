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

const TACTICS_EXAMPLE = {
  success: true,
  count: 1,
  data: [
    {
      id: 'possession',
      name: 'Possession',
      category: 'offensive',
      description:
        'Short passing and support runs to keep the ball rather than break early.',
      formationId: null,
    },
  ],
};

/**
 * Public, unauthenticated, read-only reference data on supported tactical
 * approaches. This is generic coaching content — never a team's saved game
 * plan or squad selection — see `tactics.data.ts` for the security rationale.
 */
@ApiTags('Public API')
@Controller('v1/tactics')
export class TacticsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  @ApiOperation({
    summary: 'List tactical approaches, or fetch one by id',
    description:
      'Read-only public endpoint — no authentication required. Returns every ' +
      'supported tactic, or pass ?id= to fetch a single tactic.',
  })
  @ApiQuery({
    name: 'id',
    required: false,
    description: 'Tactic id to fetch, e.g. "possession".',
  })
  @ApiOkResponse({
    description: 'Matching tactic(s).',
    schema: { example: TACTICS_EXAMPLE },
  })
  findAll(@Query() query: unknown) {
    const { id } = zodValidate(publicResourceQuerySchema, query);
    const data = id
      ? [this.publicApiService.getTactic(id)]
      : this.publicApiService.listTactics();

    return { success: true, count: data.length, data };
  }
}
