import { z } from 'zod';

/**
 * Season date fields are ISO calendar dates (`YYYY-MM-DD`), which compare
 * correctly with `<` as plain strings — no Date parsing needed to order them.
 */
const seasonFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Season name is required.')
    .max(50, 'Season name must be 50 characters or fewer.'),
  startDate: z.iso.date('Enter a valid start date.'),
  endDate: z.iso.date('Enter a valid end date.'),
  isCurrent: z.boolean().default(false),
};

export const createSeasonSchema = z
  .object(seasonFields)
  .refine((data) => data.startDate < data.endDate, {
    message: 'Season end date must be after the start date.',
    path: ['endDate'],
  });
export type CreateSeasonDto = z.infer<typeof createSeasonSchema>;

/**
 * On a partial update only one end of the range may be supplied, so this can
 * only check the pair when both are present. `SeasonsService.updateSeason`
 * merges the dto over the stored row and re-runs the ordering check there.
 */
export const updateSeasonSchema = z
  .object({
    name: seasonFields.name.optional(),
    startDate: seasonFields.startDate.optional(),
    endDate: seasonFields.endDate.optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  )
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.startDate < value.endDate,
    {
      message: 'Season end date must be after the start date.',
      path: ['endDate'],
    },
  );
export type UpdateSeasonDto = z.infer<typeof updateSeasonSchema>;
