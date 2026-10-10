import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { TeamsService } from './teams.service';
import { DatabaseService } from '../database/database.service';

describe('friendly opponent search SQL', () => {
  let pg: PGlite;
  let service: TeamsService;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE teams (id text PRIMARY KEY, name text, primary_color text);
      CREATE TABLE "user" (id text PRIMARY KEY, name text);
      CREATE TABLE team_members (team_id text, user_id text, role text);
      INSERT INTO teams VALUES ('own','Own FC',null), ('live','Chelsea FC',null), ('orphan','Chelsea FC',null), ('other','Chelsea FC',null);
      INSERT INTO "user" VALUES ('viewer','Viewer'), ('coach','Nayan'), ('co-coach','Nayan'), ('other-coach','Other coach');
      INSERT INTO team_members VALUES ('own','viewer','coach'), ('live','coach','coach'), ('live','co-coach','coach'), ('other','other-coach','coach');
    `);
    service = new TeamsService({
      database: drizzle(pg),
    } as unknown as DatabaseService);
  }, 60000);
  afterAll(async () => {
    await pg?.close();
  }, 30000);
  it('returns one row per coached team, excludes orphan/own teams, and preserves distinct same-name teams', async () => {
    const results = await service.searchTeams('viewer', 'Chelsea');
    expect(results.map((row) => row.id).sort()).toEqual(['live', 'other']);
    expect(results.find((row) => row.id === 'live')?.coachName).toBe('Nayan');
    expect(await service.searchTeams('viewer', 'Own')).toEqual([]);
  });
  it('also finds a team by the coach account name', async () => {
    expect(
      (await service.searchTeams('viewer', 'nayan')).map((row) => row.id),
    ).toEqual(['live']);
  });
});
