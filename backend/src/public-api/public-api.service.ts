import { Injectable, NotFoundException } from '@nestjs/common';
import { PUBLIC_FORMATIONS, type PublicFormation } from './formations.data';
import { PUBLIC_TACTICS, type PublicTactic } from './tactics.data';

/**
 * Serves the read-only coaching reference catalogs behind the public API.
 * Data is static and shared/reference in nature (see `formations.data.ts`
 * and `tactics.data.ts`) — nothing here is scoped to a team, athlete, or
 * user account, so no auth/team lookup is needed before returning it.
 */
@Injectable()
export class PublicApiService {
  listFormations(): readonly PublicFormation[] {
    return PUBLIC_FORMATIONS;
  }

  getFormation(id: string): PublicFormation {
    const formation = PUBLIC_FORMATIONS.find((f) => f.id === id);
    if (!formation) {
      throw new NotFoundException(`No formation found with id "${id}".`);
    }
    return formation;
  }

  listTactics(): readonly PublicTactic[] {
    return PUBLIC_TACTICS;
  }

  getTactic(id: string): PublicTactic {
    const tactic = PUBLIC_TACTICS.find((t) => t.id === id);
    if (!tactic) {
      throw new NotFoundException(`No tactic found with id "${id}".`);
    }
    return tactic;
  }
}
