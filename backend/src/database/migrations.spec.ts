import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('repairs a branch history that skipped competition results and fixtures', async () => {
  const pg = new PGlite();
  const folder = resolve(__dirname, '../../drizzle');
  const journal = JSON.parse(
    readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  try {
    for (const entry of journal.entries) {
      if (
        entry.tag === '0026_competition_match_results' ||
        entry.tag === '0027_competition_fixtures'
      ) {
        continue;
      }
      await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
    }
    const { rows } = await pg.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('competition_matches', 'competition_fixtures', 'injuries')
       ORDER BY tablename`,
    );
    expect(rows.map((row) => row.name)).toEqual([
      'competition_fixtures',
      'competition_matches',
      'injuries',
    ]);
    // A database already migrated on the injury branch must accept the merge.
    await pg.exec(
      readFileSync(resolve(folder, '0035_injuries_and_recovery.sql'), 'utf8'),
    );
  } finally {
    await pg.close();
  }
}, 60000);
