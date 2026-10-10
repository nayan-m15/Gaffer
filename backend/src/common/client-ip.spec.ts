import { resolveClientIdentity, resolveEdgeObservedIp } from './client-ip';

describe('resolveEdgeObservedIp', () => {
  it('prefers the Cloudflare-written header the caller cannot overwrite', () => {
    expect(
      resolveEdgeObservedIp(
        {
          'cf-connecting-ip': '203.0.113.5',
          'x-forwarded-for': '1.1.1.1, 198.51.100.9',
        },
        '10.0.0.1',
      ),
    ).toBe('203.0.113.5');
  });

  it('falls back to the rightmost x-forwarded-for entry, not the spoofable left', () => {
    expect(
      resolveEdgeObservedIp({ 'x-forwarded-for': '1.1.1.1, 198.51.100.9' }),
    ).toBe('198.51.100.9');
  });

  it('falls back to the socket address when no proxy headers are present', () => {
    expect(resolveEdgeObservedIp({}, '10.0.0.1')).toBe('10.0.0.1');
  });

  it('uses a shared bucket rather than exempting an unresolvable request', () => {
    expect(resolveEdgeObservedIp({})).toBe('unknown');
  });

  it('discards header values that are not bare IP addresses', () => {
    expect(
      resolveEdgeObservedIp({ 'cf-connecting-ip': 'not-an-ip' }, '10.0.0.1'),
    ).toBe('10.0.0.1');
  });

  it('reads the correct end of a header that arrived as an array', () => {
    expect(
      resolveEdgeObservedIp({
        'x-forwarded-for': ['1.1.1.1', '2.2.2.2, 198.51.100.9'],
      }),
    ).toBe('198.51.100.9');
  });

  it('accepts IPv6 addresses', () => {
    expect(resolveEdgeObservedIp({ 'cf-connecting-ip': '2001:db8::1' })).toBe(
      '2001:db8::1',
    );
  });
});

describe('resolveClientIdentity', () => {
  it('keys on the Vercel-supplied client IP and keeps the edge as a backstop', () => {
    expect(
      resolveClientIdentity({
        'x-vercel-forwarded-for': '198.51.100.9',
        'cf-connecting-ip': '203.0.113.5',
      }),
    ).toEqual({ primaryIp: '198.51.100.9', edgeIp: '203.0.113.5' });
  });

  it('counts a direct request once when both addresses agree', () => {
    expect(
      resolveClientIdentity({
        'x-vercel-forwarded-for': '203.0.113.5',
        'cf-connecting-ip': '203.0.113.5',
      }),
    ).toEqual({ primaryIp: '203.0.113.5' });
  });

  it('ignores a forged client header that is not an IP address', () => {
    expect(
      resolveClientIdentity({
        'x-vercel-forwarded-for': 'edge:203.0.113.5',
        'cf-connecting-ip': '203.0.113.5',
      }),
    ).toEqual({ primaryIp: '203.0.113.5' });
  });

  it('still produces a backstop when the client header is forged to a real IP', () => {
    expect(
      resolveClientIdentity({
        'x-vercel-forwarded-for': '1.1.1.1',
        'cf-connecting-ip': '203.0.113.5',
      }),
    ).toEqual({ primaryIp: '1.1.1.1', edgeIp: '203.0.113.5' });
  });

  it('falls back to the socket address with no headers at all', () => {
    expect(resolveClientIdentity({}, '10.0.0.1')).toEqual({
      primaryIp: '10.0.0.1',
    });
  });
});
