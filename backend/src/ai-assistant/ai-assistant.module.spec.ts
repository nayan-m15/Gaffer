import { Test } from '@nestjs/testing';

// `AuthGuard` pulls in `better-auth`, an ESM-only package Jest can't
// transform — mocked the same way `athletes.controller.spec.ts` does, since
// this test only cares about the DI graph, not request authentication.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { DatabaseModule } from '../database/database.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantModule } from './ai-assistant.module';
import { AiAssistantService } from './ai-assistant.service';

/**
 * Compiles the real module graph (no mocks) to catch wiring mistakes that
 * unit tests with mocked dependencies can't see — a provider missing from a
 * module's `exports`, a forgotten `imports` entry, a circular dependency.
 * `DatabaseService` is lazy (see `database.service.ts`), so this never opens
 * a real database connection.
 */
describe('AiAssistantModule wiring', () => {
  it('resolves the full provider graph without a mocked dependency', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, AiAssistantModule],
    }).compile();

    expect(moduleRef.get(AiAssistantService)).toBeInstanceOf(
      AiAssistantService,
    );
    expect(moduleRef.get(AiAssistantController)).toBeInstanceOf(
      AiAssistantController,
    );

    await moduleRef.close();
  });
});
