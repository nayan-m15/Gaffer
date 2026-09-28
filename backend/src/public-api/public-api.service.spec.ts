import { NotFoundException } from '@nestjs/common';
import { PUBLIC_FORMATIONS } from './formations.data';
import { PUBLIC_TACTICS } from './tactics.data';
import { PublicApiService } from './public-api.service';

describe('PublicApiService', () => {
  let service: PublicApiService;

  beforeEach(() => {
    service = new PublicApiService();
  });

  describe('formations', () => {
    it('lists every catalog formation', () => {
      expect(service.listFormations()).toEqual(PUBLIC_FORMATIONS);
    });

    it('returns a single formation by id', () => {
      expect(service.getFormation('4-3-3')).toEqual(
        PUBLIC_FORMATIONS.find((f) => f.id === '4-3-3'),
      );
    });

    it('exposes the player count for small-sided formations', () => {
      expect(service.getFormation('5v5-1-2-1').playerCount).toBe(5);
      expect(service.getFormation('7v7-2-3-1').playerCount).toBe(7);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.getFormation('does-not-exist')).toThrow(
        NotFoundException,
      );
    });

    it('only exposes id, name, shape, description and playerCount', () => {
      for (const formation of service.listFormations()) {
        expect(Object.keys(formation).sort()).toEqual(
          ['description', 'id', 'name', 'playerCount', 'shape'].sort(),
        );
      }
    });
  });

  describe('tactics', () => {
    it('lists every catalog tactic', () => {
      expect(service.listTactics()).toEqual(PUBLIC_TACTICS);
    });

    it('returns a single tactic by id', () => {
      expect(service.getTactic('possession')).toEqual(
        PUBLIC_TACTICS.find((t) => t.id === 'possession'),
      );
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.getTactic('does-not-exist')).toThrow(
        NotFoundException,
      );
    });

    it('only exposes id, name, category, description and formationId', () => {
      for (const tactic of service.listTactics()) {
        expect(Object.keys(tactic).sort()).toEqual(
          ['category', 'description', 'formationId', 'id', 'name'].sort(),
        );
      }
    });

    it('has a unique id per tactic', () => {
      const ids = service.listTactics().map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
