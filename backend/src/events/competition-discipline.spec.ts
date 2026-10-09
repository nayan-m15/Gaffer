import { replayCompetitionDiscipline, assertSuspensionEligibility } from './competition-discipline';

describe('competition discipline', () => {
  const card = (fixture_id: string, athlete_id: string, event_type: string) => ({ fixture_id, athlete_id, event_type });

  it('suspends after threshold and serves only subsequent completed fixtures', () => {
    const cards = [card('f1', 'a', 'yellow_card'), card('f2', 'a', 'yellow_card')];
    expect(replayCompetitionDiscipline(['f1', 'f2'], cards, 2, 1, 1)).toEqual([
      { athleteId: 'a', remainingMatches: 1, reason: 'yellow_accumulation' },
    ]);
    expect(replayCompetitionDiscipline(['f1', 'f2', 'f3'], cards, 2, 1, 1)).toEqual([]);
  });

  it('tracks each athlete separately and enforces red card bans', () => {
    const cards = [card('f1', 'a', 'red_card'), card('f1', 'b', 'yellow_card')];
    expect(replayCompetitionDiscipline(['f1', 'f2'], cards, 5, 1, 3)).toEqual([
      { athleteId: 'a', remainingMatches: 2, reason: 'red_card' },
    ]);
  });

  it('ignores voided input excluded by caller and allows disabled sanctions', () => {
    expect(replayCompetitionDiscipline(['f1'], [card('f1','a','red_card')], 5, 1, 0)).toEqual([]);
  });

  it('blocks suspended athletes from either starters or bench', () => {
    expect(() => assertSuspensionEligibility(['a'], [{ athleteId: 'a', remainingMatches: 2, reason: 'red_card' }])).toThrow('suspended');
  });
});
