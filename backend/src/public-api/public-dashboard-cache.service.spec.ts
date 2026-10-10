import { PublicDashboardCacheService } from './public-dashboard-cache.service';

describe('PublicDashboardCacheService', () => {
  let cache: PublicDashboardCacheService;

  beforeEach(() => {
    jest.useRealTimers();
    delete process.env.PUBLIC_DASHBOARD_CACHE_TTL_SECONDS;
    delete process.env.PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES;
    cache = new PublicDashboardCacheService();
  });

  afterEach(() => {
    delete process.env.PUBLIC_DASHBOARD_CACHE_TTL_SECONDS;
    delete process.env.PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES;
  });

  it('runs the loader once and serves the cached value afterwards', async () => {
    const load = jest.fn().mockResolvedValue(['player']);

    await expect(cache.resolve('players', load)).resolves.toEqual(['player']);
    await expect(cache.resolve('players', load)).resolves.toEqual(['player']);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent misses for one key onto a single query', async () => {
    let release!: (value: string[]) => void;
    const load = jest.fn().mockReturnValue(
      new Promise<string[]>((resolve) => {
        release = resolve;
      }),
    );

    const inFlight = Promise.all([
      cache.resolve('players', load),
      cache.resolve('players', load),
      cache.resolve('players', load),
    ]);
    release(['player']);

    await expect(inFlight).resolves.toEqual([
      ['player'],
      ['player'],
      ['player'],
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct keys independent', async () => {
    const players = jest.fn().mockResolvedValue(['player']);
    const matches = jest.fn().mockResolvedValue(['match']);

    await expect(cache.resolve('players', players)).resolves.toEqual([
      'player',
    ]);
    await expect(cache.resolve('matches', matches)).resolves.toEqual(['match']);

    expect(players).toHaveBeenCalledTimes(1);
    expect(matches).toHaveBeenCalledTimes(1);
  });

  it('reloads once the entry has expired', async () => {
    process.env.PUBLIC_DASHBOARD_CACHE_TTL_SECONDS = '1';
    const load = jest
      .fn()
      .mockResolvedValueOnce(['first'])
      .mockResolvedValueOnce(['second']);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000);
    await expect(cache.resolve('players', load)).resolves.toEqual(['first']);

    nowSpy.mockReturnValue(1_999);
    await expect(cache.resolve('players', load)).resolves.toEqual(['first']);

    nowSpy.mockReturnValue(2_001);
    await expect(cache.resolve('players', load)).resolves.toEqual(['second']);

    expect(load).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('never caches a rejection, so a transient failure costs one request', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unreachable'))
      .mockResolvedValueOnce(['player']);

    await expect(cache.resolve('players', load)).rejects.toThrow(
      'database unreachable',
    );
    await expect(cache.resolve('players', load)).resolves.toEqual(['player']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest-first so rotating keys cannot grow the cache', async () => {
    process.env.PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES = '2';
    const loader = (value: string) => jest.fn().mockResolvedValue([value]);

    const a = loader('a');
    await cache.resolve('a', a);
    await cache.resolve('b', loader('b'));

    // Both fit, so neither has been displaced yet.
    const residentB = loader('b');
    await cache.resolve('b', residentB);
    expect(residentB).not.toHaveBeenCalled();

    // A third key pushes the cache over the cap and drops the oldest entry.
    await cache.resolve('c', loader('c'));
    await cache.resolve('a', a);
    expect(a).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default TTL when the override is not a positive integer', async () => {
    process.env.PUBLIC_DASHBOARD_CACHE_TTL_SECONDS = 'not-a-number';
    const load = jest.fn().mockResolvedValue(['player']);

    await cache.resolve('players', load);
    await cache.resolve('players', load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  describe('key', () => {
    it('collapses equivalent queries onto one entry', () => {
      const a = PublicDashboardCacheService.key('players', {
        limit: 100,
        teamId: 'team-1',
        offset: 0,
      });
      const b = PublicDashboardCacheService.key('players', {
        offset: 0,
        teamId: 'team-1',
        limit: 100,
      });

      expect(a).toBe(b);
    });

    it('omits absent filters and separates different ones', () => {
      expect(
        PublicDashboardCacheService.key('players', {
          teamId: undefined,
          limit: 100,
        }),
      ).toBe('players?limit=100');
      expect(PublicDashboardCacheService.key('filters', {})).toBe('filters');
      expect(
        PublicDashboardCacheService.key('players', { teamId: 'team-1' }),
      ).not.toBe(
        PublicDashboardCacheService.key('players', { teamId: 'team-2' }),
      );
    });

    it('does not let one route read another route’s entry', () => {
      expect(PublicDashboardCacheService.key('players', {})).not.toBe(
        PublicDashboardCacheService.key('matches', {}),
      );
    });
  });
});
