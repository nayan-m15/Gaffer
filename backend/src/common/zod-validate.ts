import { BadRequestException } from '@nestjs/common';
import type { ZodType, z } from 'zod';

/**
 * Parses `input` against `schema`, throwing a `BadRequestException` with the
 * first validation issue when it doesn't match. Used instead of
 * `class-validator` DTOs since the project already depends on `zod`.
 */
export function zodValidate<Schema extends ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new BadRequestException(issue?.message ?? 'Invalid request body.');
  }
  return result.data;
}
