import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { competitions } from '../database/schema';

export const settingKeys = [
  'format',
  'configuredTeamCount',
  'playersPerSide',
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
  if (row.playersPerSide != null && ![5, 7, 11].includes(row.playersPerSide)) {
    throw new BadRequestException('Players per side must be 5, 7 or 11.');
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
  now = new Date(),
  timezone = 'UTC',
): PlannedFixture[] {
  const { size, format } = validateFixtureParticipants(
    competition,
    participantIds,
  );
  const nextDate = createFixtureDatePicker(competition, now, timezone);
  const add = createFixtureFactory(format);
  if (format === 'knockout') {
    return planKnockoutFixtures(size, participantIds, nextDate, add);
  }
  return planLeagueFixtures(
    size,
    participantIds,
    competition.fixturesPerOpponent,
    nextDate,
    add,
  );
}

type FixtureFormat = 'league' | 'knockout' | 'league_knockout';
type NextFixtureDate = () => string;
type AddFixture = (
  round: number,
  position: number,
  home: string | null,
  away: string | null,
  scheduledAt: string,
) => PlannedFixture;

function validateFixtureParticipants(
  competition: typeof competitions.$inferSelect,
  participantIds: string[],
): { size: number; format: FixtureFormat } {
  validateSettings(competition);
  if (competition.type === 'friendly') {
    throw new BadRequestException(
      'Friendly matches do not use fixture generation.',
    );
  }
  const size = competition.configuredTeamCount;
  if (!size) {
    throw new BadRequestException(
      'Configure the team count before generating fixtures.',
    );
  }
  if (participantIds.length !== size) {
    throw new BadRequestException(
      participantIds.length < size
        ? `Add ${size - participantIds.length} more teams before generating fixtures (${participantIds.length}/${size}).`
        : `Remove ${participantIds.length - size} teams to match the configured count of ${size}.`,
    );
  }
  if (new Set(participantIds).size !== size) {
    throw new BadRequestException('Participants must be unique.');
  }
  if (!competition.startDate || !competition.allowedPlayingDays?.length) {
    throw new BadRequestException(
      'Configure a start date and allowed playing days.',
    );
  }
  const format =
    competition.format ?? (competition.type === 'cup' ? 'knockout' : 'league');
  if (format === 'league_knockout' && !competition.qualifierCount) {
    throw new BadRequestException(
      'Configure the qualifier count before generating fixtures.',
    );
  }
  return { size, format };
}

function createFixtureDatePicker(
  competition: typeof competitions.$inferSelect,
  now: Date,
  timezone: string,
): NextFixtureDate {
  let date = competition.startDate ?? '';
  const days = competition.allowedPlayingDays ?? [];
  const kickoff = competition.defaultKickoffTime;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(kickoff) ||
    days.some((day) => day < 0 || day > 6)
  ) {
    throw new BadRequestException('Invalid fixture schedule settings.');
  }
  assertValidTimezone(timezone);

  return () => {
    while (true) {
      const weekday = weekdayForCalendarDate(date);
      if (days.includes(weekday)) {
        const scheduled = localScheduleToUtc(date, kickoff, timezone);
        if (scheduled.getTime() >= now.getTime()) {
          const value = scheduled.toISOString();
          date = addCalendarDays(date, 1);
          return value;
        }
      }
      date = addCalendarDays(date, 1);
    }
  };
}

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('Invalid fixture timezone.');
  }
}

function weekdayForCalendarDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addCalendarDays(value: string, amount: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function localScheduleToUtc(
  dateValue: string,
  timeValue: string,
  timezone: string,
): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);

  // Resolve the timezone offset for this specific fixture date, rather than
  // using the server timezone or today's browser offset. Two passes handle
  // DST boundaries where the initial UTC guess lands on the other offset.
  let candidate = wallClockUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = zonedParts(new Date(candidate), timezone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    candidate = wallClockUtc - (representedAsUtc - candidate);
  }

  const resolved = new Date(candidate);
  const parts = zonedParts(resolved, timezone);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute
  ) {
    throw new BadRequestException(
      'The selected kickoff time does not exist in the chosen timezone.',
    );
  }
  return resolved;
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day' | 'hour' | 'minute') =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function createFixtureFactory(format: FixtureFormat): AddFixture {
  return (round, position, home, away, scheduledAt) => ({
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
}

function planKnockoutFixtures(
  size: number,
  participantIds: string[],
  nextDate: NextFixtureDate,
  add: AddFixture,
): PlannedFixture[] {
  const fixtures: PlannedFixture[] = [];
  let previous: PlannedFixture[] = [];
  for (let round = 1, games = size / 2; games >= 1; round++, games /= 2) {
    const scheduled = nextDate();
    const current = Array.from({ length: games }, (_, index) =>
      add(
        round,
        index + 1,
        round === 1 ? participantIds[index * 2] : null,
        round === 1 ? participantIds[index * 2 + 1] : null,
        scheduled,
      ),
    );
    previous.forEach((fixture, index) => {
      fixture.nextFixtureId = current[Math.floor(index / 2)].id;
      fixture.nextFixtureSlot = index % 2 === 0 ? 'home' : 'away';
    });
    fixtures.push(...current);
    previous = current;
  }
  return fixtures;
}

function planLeagueFixtures(
  size: number,
  participantIds: string[],
  fixturesPerOpponent: number | null,
  nextDate: NextFixtureDate,
  add: AddFixture,
): PlannedFixture[] {
  const fixtures: PlannedFixture[] = [];
  const rotating: (string | null)[] = [...participantIds];
  if (size % 2) rotating.push(null);
  for (let round = 1; round < rotating.length; round++) {
    addLeagueRound(fixtures, rotating, round, nextDate(), add);
  }
  if (fixturesPerOpponent === 2) {
    addReturnLegs(fixtures, rotating.length - 1, nextDate, add);
  }
  return fixtures;
}

function addLeagueRound(
  fixtures: PlannedFixture[],
  rotating: (string | null)[],
  round: number,
  scheduled: string,
  add: AddFixture,
): void {
  for (let index = 0; index < rotating.length / 2; index++) {
    const home = rotating[index];
    const away = rotating[rotating.length - 1 - index];
    if (home && away) {
      fixtures.push(
        add(
          round,
          index + 1,
          round % 2 ? home : away,
          round % 2 ? away : home,
          scheduled,
        ),
      );
    }
  }
  rotating.splice(1, 0, rotating.pop()!);
}

function addReturnLegs(
  fixtures: PlannedFixture[],
  rounds: number,
  nextDate: NextFixtureDate,
  add: AddFixture,
): void {
  const firstLeg = [...fixtures];
  for (let round = 1; round <= rounds; round++) {
    const scheduled = nextDate();
    firstLeg
      .filter((fixture) => fixture.round === round)
      .forEach((fixture) => {
        fixtures.push(
          add(
            round + rounds,
            fixture.position,
            fixture.awayCompetitionTeamId,
            fixture.homeCompetitionTeamId,
            scheduled,
          ),
        );
      });
  }
}
