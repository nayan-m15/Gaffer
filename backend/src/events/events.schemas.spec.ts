import {
  createEventSchema,
  startMatchSchema,
  updateEventSchema,
} from './events.schemas';

const starterIds = Array.from(
  { length: 11 },
  (_, index) =>
    `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee${String(index).padStart(2, '0')}`,
);

function startMatchBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    opponentName: 'Stellenbosch',
    isHome: true,
    startingAthleteIds: starterIds,
    opponentSquadVisibility: 'numbers',
    opponentSquad: [{ shirtNumber: 9 }],
    ...overrides,
  };
}

describe('startMatchSchema opponent positions', () => {
  it('accepts an omitted position', () => {
    const parsed = startMatchSchema.parse(startMatchBody());
    expect(parsed.opponentSquad?.[0]).toMatchObject({ shirtNumber: 9 });
    expect(parsed.opponentSquad?.[0]?.position).toBeUndefined();
  });

  it('accepts a formation abbreviation and uppercases it', () => {
    const parsed = startMatchSchema.parse(
      startMatchBody({
        opponentSquad: [{ shirtNumber: 9, position: 'st' }],
      }),
    );
    expect(parsed.opponentSquad?.[0]?.position).toBe('ST');
  });

  it('treats an empty position as null', () => {
    const parsed = startMatchSchema.parse(
      startMatchBody({
        opponentSquad: [{ shirtNumber: 9, position: '   ' }],
      }),
    );
    expect(parsed.opponentSquad?.[0]?.position).toBeNull();
  });

  it('rejects an unknown position abbreviation', () => {
    expect(() =>
      startMatchSchema.parse(
        startMatchBody({
          opponentSquad: [{ shirtNumber: 9, position: 'XX' }],
        }),
      ),
    ).toThrow();
  });
});

describe('event venue coordinates', () => {
  const event = {
    title: 'Evening training',
    type: 'training',
    scheduledAt: '2026-09-20T18:00:00+02:00',
    location: 'Main pitch',
  };

  it('accepts a confirmed location with paired coordinates', () => {
    expect(
      createEventSchema.parse({
        ...event,
        venueAddress: '1 Sport Street',
        weatherLocation: 'Stellenbosch, Western Cape, South Africa',
        weatherLatitude: -33.9321,
        weatherLongitude: 18.8602,
        weatherTimezone: 'Africa/Johannesburg',
      }),
    ).toMatchObject({
      venueAddress: '1 Sport Street',
      weatherLatitude: -33.9321,
      weatherLongitude: 18.8602,
    });
  });

  it('rejects an invalid venue timezone', () => {
    expect(() =>
      createEventSchema.parse({
        ...event,
        weatherLatitude: -33.9321,
        weatherLongitude: 18.8602,
        weatherTimezone: 'South Africa time',
      }),
    ).toThrow();
  });

  it('rejects an unpaired coordinate on create or update', () => {
    expect(() =>
      createEventSchema.parse({ ...event, weatherLatitude: -33.9321 }),
    ).toThrow();
    expect(() =>
      updateEventSchema.parse({ weatherLongitude: 18.8602 }),
    ).toThrow();
  });
});
