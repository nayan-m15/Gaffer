import { sql } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { competitionAttributedEvents } from '../competitions/competition-attributed-events';

export type CompetitionSuspension = {
  athleteId: string;
  remainingMatches: number;
  reason: 'red_card' | 'yellow_accumulation';
};

type CardRow = {
  fixture_id: string;
  athlete_id: string | null;
  event_type: string | null;
};
type FixtureRow = { id: string };

/** Pure replay: sanctions are incurred after a completed fixture and served in
 * subsequent completed fixtures, whether or not the suspended athlete plays.
 * A current/unplayed fixture never consumes a suspension. */
export function replayCompetitionDiscipline(
  fixtureIds: string[],
  cards: CardRow[],
  threshold: number,
  yellowBan: number,
  redBan: number,
): CompetitionSuspension[] {
  const perFixture = new Map<string, CardRow[]>();
  for (const card of cards) {
    if (
      !card.athlete_id ||
      !['yellow_card', 'red_card'].includes(card.event_type ?? '')
    )
      continue;
    const events = perFixture.get(card.fixture_id) ?? [];
    events.push(card);
    perFixture.set(card.fixture_id, events);
  }
  const state = new Map<
    string,
    {
      remaining: number;
      yellow: number;
      reason: CompetitionSuspension['reason'];
    }
  >();
  for (const fixtureId of fixtureIds) {
    // Serve existing suspensions before processing the cards from this fixture.
    for (const item of state.values())
      item.remaining = Math.max(0, item.remaining - 1);
    for (const card of perFixture.get(fixtureId) ?? []) {
      const id = card.athlete_id!;
      const current = state.get(id) ?? {
        remaining: 0,
        yellow: 0,
        reason: 'yellow_accumulation' as const,
      };
      if (card.event_type === 'red_card') {
        current.remaining += redBan;
        current.reason = 'red_card';
      } else if (threshold > 0) {
        current.yellow += 1;
        if (current.yellow >= threshold) {
          current.yellow -= threshold;
          current.remaining += yellowBan;
          current.reason = 'yellow_accumulation';
        }
      }
      state.set(id, current);
    }
  }
  return [...state.entries()]
    .filter(([, state]) => state.remaining > 0)
    .map(([athleteId, state]) => ({
      athleteId,
      remainingMatches: state.remaining,
      reason: state.reason,
    }));
}

/** Resolves sanctions for the signed-in team's fixture only. Manual-score-only
 * fixtures can serve a suspension, but cannot create an attributed card. */
export async function getCompetitionSuspensions(
  databaseService: DatabaseService,
  teamId: string,
  competitionId: string | null,
  scheduledAt: Date,
  currentFixtureId?: string | null,
): Promise<CompetitionSuspension[]> {
  if (!competitionId) return [];
  const db = databaseService.database;
  const config = await db.execute(sql`
    select c.accumulated_yellow_threshold as threshold,
           c.yellow_suspension_matches as yellow_ban,
           c.red_card_suspension_matches as red_ban
    from competitions c
    join competition_teams ct on ct.competition_id = c.id
    where c.id = ${competitionId}::uuid and ct.team_id = ${teamId}::uuid
    limit 1
  `);
  const rule = config.rows[0];
  if (!rule) return [];
  const history = await db.execute(sql`
    select cf.id::text as id
    from competition_fixtures cf
    join competition_teams ct on ct.competition_id = cf.competition_id
    where cf.competition_id = ${competitionId}::uuid and ct.team_id = ${teamId}::uuid
      and (cf.home_competition_team_id = ct.id or cf.away_competition_team_id = ct.id)
      and cf.status = 'completed'
      and cf.scheduled_at < ${scheduledAt}
      and (${currentFixtureId ?? null}::uuid is null or cf.id <> ${currentFixtureId ?? null}::uuid)
    order by cf.scheduled_at, cf.id
  `);
  const fixtures = history.rows as unknown as FixtureRow[];
  if (fixtures.length === 0) return [];
  const cards = await db.execute(sql`
    ${competitionAttributedEvents}
    select d.fixture_id::text as fixture_id,
           d.athlete_id::text as athlete_id, d.event_type
    from deduplicated d
    join athletes a on a.id = d.athlete_id and a.team_id = ${teamId}::uuid
    join competition_fixtures f on f.id = d.fixture_id
    where f.competition_id = ${competitionId}::uuid
      and d.fixture_id in (${sql.join(
        fixtures.map((x) => sql`${x.id}::uuid`),
        sql`, `,
      )})
      and d.event_type in ('yellow_card', 'red_card')
  `);
  return replayCompetitionDiscipline(
    fixtures.map((x) => x.id),
    cards.rows as unknown as CardRow[],
    Number(rule.threshold),
    Number(rule.yellow_ban),
    Number(rule.red_ban),
  );
}

export function assertSuspensionEligibility(
  selectedAthleteIds: string[],
  suspensions: CompetitionSuspension[],
): void {
  const blocked = suspensions.find((s) =>
    selectedAthleteIds.includes(s.athleteId),
  );
  if (blocked)
    throw new BadRequestException(
      `A suspended player cannot be selected (${blocked.remainingMatches} competition match(es) remaining).`,
    );
}
