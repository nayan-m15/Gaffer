import { publicFormationChange } from './public-formation-change';

it('allowlists public geometry and removes private player IDs/settings and extra coordinate fields', () => {
  expect(
    publicFormationChange({
      tacticalChange: {
        formationId: 'custom-5',
        captainId: 'secret',
        defensiveWidth: 9,
        customPositions: [
          {
            id: 'gk',
            label: 'GK',
            role: 'GK',
            x: 50,
            y: 94,
            privateNote: 'secret',
          },
        ],
      },
    }),
  ).toEqual({
    formationId: 'custom-5',
    customPositions: [{ id: 'gk', label: 'GK', role: 'GK', x: 50, y: 94 }],
  });
  expect(
    publicFormationChange({ tacticalChange: { offensiveWidth: 4 } }),
  ).toBeNull();
  expect(publicFormationChange(null)).toBeNull();
});
