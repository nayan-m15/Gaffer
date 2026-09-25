import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('concurrent event candidates', () => {
  let pg: PGlite;
  let matchId: string;
  const coachId = 'candidate-test-coach';

  beforeAll(async () => {
    pg = new PGlite();
    const folder = resolve(__dirname, '../../drizzle');
    const journal = JSON.parse(
      readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    for (const entry of journal.entries) {
      await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
    }
    const teamId = randomUUID();
    const eventId = randomUUID();
    matchId = randomUUID();
    await pg.query(
      `INSERT INTO "user" (id, name, email)
      VALUES ($1, 'Coach', 'candidate@example.com')`,
      [coachId],
    );
    await pg.query(`INSERT INTO teams (id, name) VALUES ($1, 'Candidate FC')`, [
      teamId,
    ]);
    await pg.query(
      `INSERT INTO events
      (id, team_id, title, type, scheduled_at, location)
      VALUES ($1, $2, 'Candidate match', 'match', now(), 'Ground')`,
      [eventId, teamId],
    );
    await pg.query(
      `INSERT INTO matches (id, event_id, opponent_name)
      VALUES ($1, $2, 'Visitors')`,
      [matchId, eventId],
    );
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  async function observe(id: string, elapsedMs: number) {
    const payload = {
      team: 'opponent',
      eventType: 'goal',
      period: 'first_half',
      matchElapsedMs: elapsedMs,
    };
    await pg.query(
      `SELECT ingest_match_event_observation(
      $1::uuid, $2::uuid, $3::uuid, $4::text, 'goal'::match_event_type,
      'opponent'::match_event_team, NULL::uuid, 'Number 9'::text, NULL::uuid,
      'first_half'::text, $5::integer, 12::integer, NULL::text,
      $6::jsonb, $7::text, now(), false
    )`,
      [
        id,
        matchId,
        randomUUID(),
        coachId,
        elapsedMs,
        JSON.stringify(payload),
        id,
      ],
    );
  }

  it('preserves independent actions and applies explicit same/separate decisions', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await observe(first, 720_000);
    await observe(second, 723_000);
    const before = await pg.query<{ id: string }>(
      `SELECT id FROM match_events WHERE match_id = $1 AND lifecycle_status <> 'voided'`,
      [matchId],
    );
    expect(before.rows).toHaveLength(2);
    const review = await pg.query<{
      id: string;
      review_version: number;
      observation_ids: string[];
    }>(
      `SELECT id, review_version, observation_ids FROM match_event_reviews
       WHERE match_id = $1 AND status = 'open'`,
      [matchId],
    );
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0].review_version).toBe(2);
    expect(review.rows[0].observation_ids.sort()).toEqual(
      [first, second].sort(),
    );
    await pg.query(`SELECT refresh_match_projection($1::uuid)`, [matchId]);
    const provisional = await pg.query<{
      revision: number;
      provisional_opponent_score: number;
      unresolved_review_count: number;
    }>(
      `SELECT revision, provisional_opponent_score, unresolved_review_count
       FROM match_projection_state WHERE match_id = $1`,
      [matchId],
    );
    expect(provisional.rows[0]).toMatchObject({
      revision: 2,
      provisional_opponent_score: 2,
      unresolved_review_count: 1,
    });
    await pg.query(`SELECT refresh_match_projection($1::uuid)`, [matchId]);
    const unchanged = await pg.query<{ revision: number }>(
      `SELECT revision FROM match_projection_state WHERE match_id = $1`,
      [matchId],
    );
    expect(unchanged.rows[0].revision).toBe(2);

    const mergeId = randomUUID();
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'same_event'::text, '[]'::jsonb
    )`,
      [review.rows[0].id, matchId, coachId, mergeId],
    );
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'same_event'::text, '[]'::jsonb
    )`,
      [review.rows[0].id, matchId, coachId, mergeId],
    );
    const merged = await pg.query<{ id: string }>(
      `SELECT id FROM match_events WHERE match_id = $1 AND lifecycle_status <> 'voided'`,
      [matchId],
    );
    expect(merged.rows).toHaveLength(1);
    await pg.query(`SELECT refresh_match_projection($1::uuid)`, [matchId]);
    const confirmed = await pg.query<{
      revision: number;
      provisional_opponent_score: number;
      unresolved_review_count: number;
    }>(
      `SELECT revision, provisional_opponent_score, unresolved_review_count
       FROM match_projection_state WHERE match_id = $1`,
      [matchId],
    );
    expect(confirmed.rows[0]).toMatchObject({
      revision: 3,
      provisional_opponent_score: 1,
      unresolved_review_count: 0,
    });
    await pg.query(
      `UPDATE events SET status = 'completed'
       WHERE id = (SELECT event_id FROM matches WHERE id = $1)`,
      [matchId],
    );
    const finalised = await pg.query<{ accepted: boolean }>(
      `SELECT finalise_match_projection($1::uuid, $2::integer, $3::text) AS accepted`,
      [matchId, confirmed.rows[0].revision, coachId],
    );
    expect(finalised.rows[0].accepted).toBe(true);
    const staleFinalisation = await pg.query<{ accepted: boolean }>(
      `SELECT finalise_match_projection($1::uuid, 1::integer, $2::text) AS accepted`,
      [matchId, coachId],
    );
    expect(staleFinalisation.rows[0].accepted).toBe(false);

    const third = randomUUID();
    const fourth = randomUUID();
    await observe(third, 900_000);
    const amended = await pg.query<{ finalisation_state: string }>(
      `SELECT finalisation_state FROM match_projection_state WHERE match_id = $1`,
      [matchId],
    );
    expect(amended.rows[0].finalisation_state).toBe('amendment_required');
    await observe(fourth, 903_000);
    const separateReview = await pg.query<{ id: string }>(
      `SELECT id FROM match_event_reviews
       WHERE match_id = $1 AND status = 'open' AND observation_ids ? $2::text`,
      [matchId, third],
    );
    expect(separateReview.rows).toHaveLength(1);
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'separate_events'::text, '[]'::jsonb
    )`,
      [separateReview.rows[0].id, matchId, coachId, randomUUID()],
    );
    const distinct = await pg.query<{ id: string }>(
      `SELECT id FROM match_events WHERE match_id = $1 AND lifecycle_status <> 'voided'`,
      [matchId],
    );
    expect(distinct.rows).toHaveLength(3);

    const voidedOriginal = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
    const lateVoidWitness = '00000000-0000-4000-8000-000000000001';
    await observe(voidedOriginal, 1_080_000);
    await pg.query(
      `UPDATE match_events SET lifecycle_status = 'voided'
      WHERE id = $1`,
      [voidedOriginal],
    );
    await observe(lateVoidWitness, 1_083_000);
    const voidReview = await pg.query<{ id: string }>(
      `SELECT id FROM match_event_reviews WHERE status = 'open'
       AND observation_ids ? $1::text`,
      [voidedOriginal],
    );
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'same_event'::text, '[]'::jsonb
    )`,
      [voidReview.rows[0].id, matchId, coachId, randomUUID()],
    );
    const voidedResult = await pg.query<{ lifecycle_status: string }>(
      `SELECT lifecycle_status FROM match_events WHERE id = $1`,
      [lateVoidWitness],
    );
    expect(voidedResult.rows[0].lifecycle_status).toBe('voided');

    const correctedOriginal = 'ffffffff-ffff-4fff-8fff-fffffffffff2';
    const lateCorrectionWitness = '00000000-0000-4000-8000-000000000002';
    await observe(correctedOriginal, 1_200_000);
    await pg.query(
      `UPDATE match_events SET detail = 'Corrected scorer'
      WHERE id = $1`,
      [correctedOriginal],
    );
    await pg.query(
      `INSERT INTO match_event_operations
      (id, match_id, actor_user_id, operation_type, target_observation_ids,
       canonical_event_id, decision)
      VALUES ($1, $2, $3, 'correct', $4::jsonb, $5, $6::jsonb)`,
      [
        randomUUID(),
        matchId,
        coachId,
        JSON.stringify([correctedOriginal]),
        correctedOriginal,
        JSON.stringify({ replacement: { detail: 'Corrected scorer' } }),
      ],
    );
    await observe(lateCorrectionWitness, 1_203_000);
    const correctionReview = await pg.query<{ id: string }>(
      `SELECT id FROM match_event_reviews WHERE status = 'open'
       AND observation_ids ? $1::text`,
      [correctedOriginal],
    );
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'same_event'::text, '[]'::jsonb
    )`,
      [correctionReview.rows[0].id, matchId, coachId, randomUUID()],
    );
    const correctedResult = await pg.query<{ detail: string }>(
      `SELECT detail FROM match_events WHERE id = $1`,
      [lateCorrectionWitness],
    );
    expect(correctedResult.rows[0].detail).toBe('Corrected scorer');

    const competingId = randomUUID();
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'separate_events'::text, '[]'::jsonb
    )`,
      [review.rows[0].id, matchId, coachId, competingId],
    );
    const conflict = await pg.query<{ status: string; reason: string }>(
      `SELECT status, reason FROM match_event_reviews WHERE id = $1`,
      [review.rows[0].id],
    );
    expect(conflict.rows[0]).toMatchObject({
      status: 'open',
      reason: 'conflicting_resolution',
    });
    await pg.query(
      `SELECT resolve_match_event_candidate(
      $1::uuid, $2::uuid, $3::text, $4::uuid, 'separate_events'::text, $5::jsonb
    )`,
      [
        review.rows[0].id,
        matchId,
        coachId,
        randomUUID(),
        JSON.stringify([mergeId, competingId]),
      ],
    );
    const afterConflict = await pg.query<{ canonical_event_id: string }>(
      `SELECT canonical_event_id FROM match_event_memberships
       WHERE observation_id IN ($1, $2)`,
      [first, second],
    );
    expect(
      new Set(afterConflict.rows.map((row) => row.canonical_event_id)).size,
    ).toBe(2);
  }, 120_000);

  it('keeps a separate decision when a third nearby observation is merged', async () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await observe(a, 1_500_000);
    await observe(b, 1_502_000);
    await observe(c, 1_504_000);
    const reviewFor = async (left: string, right: string) => {
      const result = await pg.query<{ id: string }>(
        `SELECT id FROM match_event_reviews
         WHERE match_id = $1 AND observation_ids ? $2::text
           AND observation_ids ? $3::text`,
        [matchId, left, right],
      );
      return result.rows[0].id;
    };
    const decide = async (
      reviewId: string,
      resolution: 'same_event' | 'separate_events',
      operationId = randomUUID(),
      parents: string[] = [],
    ) => {
      await pg.query(
        `SELECT resolve_match_event_candidate(
          $1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::jsonb
        )`,
        [
          reviewId,
          matchId,
          coachId,
          operationId,
          resolution,
          JSON.stringify(parents),
        ],
      );
      return operationId;
    };
    const ab = await reviewFor(a, b);
    const bc = await reviewFor(b, c);
    const ac = await reviewFor(a, c);
    const abSeparate = await decide(ab, 'separate_events');
    await decide(bc, 'same_event');
    const acBlocked = await decide(ac, 'same_event');
    const blocked = await pg.query<{ status: string; reason: string }>(
      `SELECT status, reason FROM match_event_reviews WHERE id = $1`,
      [ac],
    );
    expect(blocked.rows[0]).toEqual({
      status: 'open',
      reason: 'conflicting_resolution',
    });
    const distinct = await pg.query<{ canonical_event_id: string }>(
      `SELECT canonical_event_id FROM match_event_memberships
       WHERE observation_id IN ($1, $2)`,
      [a, b],
    );
    expect(
      new Set(distinct.rows.map((row) => row.canonical_event_id)).size,
    ).toBe(2);

    const abChallenge = await decide(ab, 'same_event');
    await decide(ab, 'same_event', randomUUID(), [abSeparate, abChallenge]);
    await decide(ac, 'same_event', randomUUID(), [acBlocked]);
    const merged = await pg.query<{ canonical_event_id: string }>(
      `SELECT canonical_event_id FROM match_event_memberships
       WHERE observation_id IN ($1, $2, $3)`,
      [a, b, c],
    );
    expect(new Set(merged.rows.map((row) => row.canonical_event_id)).size).toBe(
      1,
    );
  }, 120_000);
});
