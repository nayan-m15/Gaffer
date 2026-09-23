import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { competitions } from '../database/schema';

export const settingKeys = [
  'format',
  'configuredTeamCount',
  'maxSubstitutes',
  'redCardSuspensionMatches',
  'accumulatedYellowThreshold',
  'yellowSuspensionMatches',
  'startDate',
  'allowedPlayingDays',
  'defaultKickoffTime',
  'fixturesPerOpponent',
  'pointsWin',
  'pointsDraw',
  'pointsLoss',
  'qualifierCount',
] as const;

export const settingsColumns = Object.fromEntries(
  settingKeys.map((key) => [key, competitions[key]]),
) as Pick<typeof competitions, (typeof settingKeys)[number]>;

export function settingsView(row: Partial<typeof competitions.$inferSelect>) {
  return Object.fromEntries(
    settingKeys.map((key) => [key, row[key]]),
  ) as Partial<
    Pick<typeof competitions.$inferSelect, (typeof settingKeys)[number]>
  >;
}

export function validateSettings(
  row: Partial<typeof competitions.$inferSelect>,
) {
  const format = row.format ?? (row.type === 'cup' ? 'knockout' : 'league');
  if (
    (row.type === 'league' && format !== 'league') ||
    (row.type === 'cup' && format === 'league')
  ) {
    throw new BadRequestException('Format must match the competition type.');
  }
  if (
    format === 'knockout' &&
    row.configuredTeamCount != null &&
    ![4, 8, 16, 32].includes(row.configuredTeamCount)
  ) {
    throw new BadRequestException(
      'Knockout competitions require 4, 8, 16 or 32 teams.',
    );
  }
  if (
    row.qualifierCount != null &&
    (format !== 'league_knockout' ||
      ![4, 8, 16, 32].includes(row.qualifierCount) ||
      row.configuredTeamCount == null ||
      row.qualifierCount > row.configuredTeamCount)
  ) {
    throw new BadRequestException(
      'Qualifiers must be 4, 8, 16 or 32 and cannot exceed the configured team count.',
    );
  }
}

export interface PlannedFixture {
  id: string;
  stage: 'league' | 'knockout';
  round: number;
  position: number;
  homeCompetitionTeamId: string | null;
  awayCompetitionTeamId: string | null;
  scheduledAt: string;
  nextFixtureId: string | null;
  nextFixtureSlot: 'home' | 'away' | null;
}

/** One matchday per allowed UTC date. All games in a round share kickoff. */
export function planFixtures(
  competition: typeof competitions.$inferSelect,
  participantIds: string[],
): PlannedFixture[] {
  validateSettings(competition);
  if (competition.type === 'friendly')
    throw new BadRequestException(
      'Friendly matches do not use fixture generation.',
    );
  const size = competition.configuredTeamCount;
  if (!size)
    throw new BadRequestException(
      'Configure the team count before generating fixtures.',
    );
  if (participantIds.length < size)
    throw new BadRequestException(
      `Add ${size - participantIds.length} more teams before generating fixtures (${participantIds.length}/${size}).`,
    );
  if (participantIds.length > size)
    throw new BadRequestException(
      `Remove ${participantIds.length - size} teams to match the configured count of ${size}.`,
    );
  if (new Set(participantIds).size !== size)
    throw new BadRequestException('Participants must be unique.');
  if (!competition.startDate || !competition.allowedPlayingDays?.length)
    throw new BadRequestException(
      'Configure a start date and allowed playing days.',
    );
  const format =
    competition.format ?? (competition.type === 'cup' ? 'knockout' : 'league');
  if (format === 'league_knockout' && !competition.qualifierCount)
    throw new BadRequestException(
      'Configure the qualifier count before generating fixtures.',
    );
  const date = new Date(
    `${competition.startDate}T${competition.defaultKickoffTime}:00.000Z`,
  );
  if (
    !Number.isFinite(date.getTime()) ||
    competition.allowedPlayingDays.some((day) => day < 0 || day > 6)
  )
    throw new BadRequestException('Invalid fixture schedule settings.');
  const nextDate = () => {
    while (!competition.allowedPlayingDays.includes(date.getUTCDay()))
      date.setUTCDate(date.getUTCDate() + 1);
    const scheduled = date.toISOString();
    date.setUTCDate(date.getUTCDate() + 1);
    return scheduled;
  };
  const fixtures: PlannedFixture[] = [];
  const add = (
    round: number,
    position: number,
    home: string | null,
    away: string | null,
    scheduledAt: string,
  ): PlannedFixture => ({
    id: randomUUID(),
    stage: format === 'knockout' ? 'knockout' : 'league',
    round,
    position,
    homeCompetitionTeamId: home,
    awayCompetitionTeamId: away,
    scheduledAt,
    nextFixtureId: null,
    nextFixtureSlot: null,
  });
  if (format === 'knockout') {
    let previous: PlannedFixture[] = [];
    for (let round = 1, games = size / 2; games >= 1; round++, games /= 2) {
      const scheduled = nextDate();
      const current = Array.from({ length: games }, (_, i) =>
        add(
          round,
          i + 1,
          round === 1 ? participantIds[i * 2] : null,
          round === 1 ? participantIds[i * 2 + 1] : null,
          scheduled,
        ),
      );
      previous.forEach((fixture, i) => {
        fixture.nextFixtureId = current[Math.floor(i / 2)].id;
        fixture.nextFixtureSlot = i % 2 === 0 ? 'home' : 'away';
      });
      fixtures.push(...current);
      previous = current;
    }
    return fixtures;
  }
  const rotating: (string | null)[] = [...participantIds];
  if (size % 2) rotating.push(null);
  for (let round = 1; round < rotating.length; round++) {
    const scheduled = nextDate();
    for (let i = 0; i < rotating.length / 2; i++) {
      const a = rotating[i],
        b = rotating[rotating.length - 1 - i];
      if (a && b)
        fixtures.push(
          add(round, i + 1, round % 2 ? a : b, round % 2 ? b : a, scheduled),
        );
    }
    rotating.splice(1, 0, rotating.pop()!);
  }
  if (competition.fixturesPerOpponent === 2) {
    const firstLeg = [...fixtures];
    const rounds = rotating.length - 1;
    for (let round = 1; round <= rounds; round++) {
      const scheduled = nextDate();
      firstLeg
        .filter((f) => f.round === round)
        .forEach((f) =>
          fixtures.push(
            add(
              round + rounds,
              f.position,
              f.awayCompetitionTeamId,
              f.homeCompetitionTeamId,
              scheduled,
            ),
          ),
        );
    }
  }
  return fixtures;
}
