import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { seasons } from '../database/schema';
import { matchCount } from './seasons.service';

/**
 * Guards the correlated subquery behind `matchCount`.
 *
 * Drizzle only table-qualifies column names inside an `sql` template when the
 * surrounding query has more than one table. `listSeasons` selects from
 * `seasons` alone, so a plainly interpolated `seasons.teamId` renders as a bare
 * `"team_id"` that binds to the subquery's own `events` row — a silent
 * `"team_id" = "team_id"` tautology that counts every team's matches. These
 * tests render the SQL and assert the correlation survives.
 */
describe('matchCount SQL', () => {
  const db = drizzle('postgresql://user:password@host.tld/db');

  const query = db
    .select({ id: seasons.id, matchCount })
    .from(seasons)
    .where(eq(seasons.teamId, 'team-1'))
    .orderBy(desc(seasons.startDate));

  const rendered = query.toSQL().sql;

  it('correlates the team against the outer seasons row', () => {
    expect(rendered).toContain('"team_id" = "seasons"."team_id"');
    expect(rendered).not.toContain('"team_id" = "team_id"');
  });

  it('correlates both date bounds against the outer seasons row', () => {
    expect(rendered).toContain('"seasons"."start_date"');
    expect(rendered).toContain('"seasons"."end_date"');
  });

  it('counts only completed matches', () => {
    expect(rendered).toContain(`"type" = 'match'`);
    expect(rendered).toContain(`"status" = 'completed'`);
  });

  it('reads the range as UTC rather than the session timezone', () => {
    expect(rendered).toContain("at time zone 'UTC'");
  });

  it('treats the end date as inclusive by using an exclusive next-day bound', () => {
    expect(rendered).toContain(`"seasons"."end_date"::date + 1`);
  });
});
