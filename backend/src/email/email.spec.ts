import { Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';
import {
  __resetEmailClientForTests,
  sendAssistantInviteEmail,
  sendCompetitionInviteEmail,
  sendCompetitionRepresentativeCorrectionEmail,
  sendCompetitionTeamReviewEmail,
  sendCompetitionTeamReviewOutcomeEmail,
  sendPlayerClaimInviteEmail,
  sendVerificationEmail,
} from './email';

interface SendTransacEmailCall {
  sender: { name: string; email: string };
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
}

const mockSendTransacEmail: jest.MockedFunction<
  (request: SendTransacEmailCall) => Promise<void>
> = jest.fn().mockResolvedValue(undefined);

jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: { sendTransacEmail: mockSendTransacEmail },
  })),
}));

const MockedBrevoClient = BrevoClient as unknown as jest.Mock;

describe('sendCompetitionInviteEmail', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    __resetEmailClientForTests();
    MockedBrevoClient.mockClear();
    mockSendTransacEmail.mockClear();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('logs the invite URL when email credentials are absent', async () => {
    delete process.env.BREVO_API_KEY;
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await sendCompetitionInviteEmail({
      to: 'coach@example.com',
      competitionName: 'Cup',
      teamName: 'XI',
      url: 'https://app.test/join-competition/token',
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('https://app.test/join-competition/token'),
    );
    expect(MockedBrevoClient).not.toHaveBeenCalled();
  });

  it('sends competition and participant names, escaping HTML and the URL', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    await sendCompetitionInviteEmail({
      to: 'coach@example.com',
      competitionName: '<Cup>',
      teamName: 'A & B',
      url: 'https://app.test/join-competition/token?a=1&b=2',
    });
    const [call] = mockSendTransacEmail.mock.calls[0];
    expect(call.to).toEqual([{ email: 'coach@example.com' }]);
    expect(call.htmlContent).toContain('&lt;Cup&gt;');
    expect(call.htmlContent).toContain('A &amp; B');
    expect(call.htmlContent).toContain(
      'https://app.test/join-competition/token?a=1&amp;b=2',
    );
    expect(call.htmlContent).toContain('72 hours');
  });
});

describe('sendVerificationEmail', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetEmailClientForTests();
    MockedBrevoClient.mockClear();
    mockSendTransacEmail.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('logs the verification link instead of sending when BREVO_API_KEY is unset', async () => {
    delete process.env.BREVO_API_KEY;
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await sendVerificationEmail({
      to: 'coach@example.com',
      name: 'Coach',
      url: 'https://app.test/verify?token=abc',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://app.test/verify?token=abc'),
    );
    expect(MockedBrevoClient).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('sends via Brevo when BREVO_API_KEY is set', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    process.env.EMAIL_FROM_ADDRESS = 'no-reply@sportcoachingtool.test';
    process.env.EMAIL_FROM_NAME = 'SportCoachingTool';

    await sendVerificationEmail({
      to: 'coach@example.com',
      name: 'Coach',
      url: 'https://app.test/verify?token=abc',
    });

    expect(MockedBrevoClient).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

    const [call] = mockSendTransacEmail.mock.calls[0];
    expect(call.sender).toEqual({
      name: 'SportCoachingTool',
      email: 'no-reply@sportcoachingtool.test',
    });
    expect(call.to).toEqual([{ email: 'coach@example.com', name: 'Coach' }]);
    expect(call.subject).toBe('Verify your email address');
    expect(call.htmlContent).toContain('https://app.test/verify?token=abc');
  });

  it('escapes HTML in the recipient name', async () => {
    process.env.BREVO_API_KEY = 'test-key';

    await sendVerificationEmail({
      to: 'a@example.com',
      name: '<script>alert(1)</script>',
      url: 'https://app.test/verify',
    });

    const [{ htmlContent }] = mockSendTransacEmail.mock.calls[0];

    expect(htmlContent).not.toContain('<script>');
    expect(htmlContent).toContain('&lt;script&gt;');
  });
});

describe('the remaining transactional emails', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetEmailClientForTests();
    MockedBrevoClient.mockClear();
    mockSendTransacEmail.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  /** Every sender in this module logs rather than sends without credentials. */
  const senders: Array<[string, () => Promise<void>]> = [
    [
      'player claim invite',
      () =>
        sendPlayerClaimInviteEmail({
          to: 'player@example.com',
          playerName: 'Sam Striker',
          url: 'https://app.test/claim?token=abc',
        }),
    ],
    [
      'assistant invite',
      () =>
        sendAssistantInviteEmail({
          to: 'assistant@example.com',
          url: 'https://app.test/invite?token=abc',
        }),
    ],
    [
      'competition team review',
      () =>
        sendCompetitionTeamReviewEmail({
          to: 'admin@example.com',
          competitionName: 'Sunday League',
          invitedName: 'Rovers',
          proposedName: 'Rovers FC',
          url: 'https://app.test/review',
        }),
    ],
    [
      'competition team review outcome',
      () =>
        sendCompetitionTeamReviewOutcomeEmail({
          to: 'coach@example.com',
          competitionName: 'Sunday League',
          teamName: 'Rovers FC',
          approved: true,
          url: 'https://app.test/competition',
        }),
    ],
    [
      'representative correction',
      () =>
        sendCompetitionRepresentativeCorrectionEmail({
          to: 'admin@example.com',
          competitionName: 'Sunday League',
          teamName: 'Rovers FC',
          recipientEmail: 'player@example.com',
          url: 'https://app.test/competition',
        }),
    ],
  ];

  it.each(senders)(
    'logs the %s instead of sending when BREVO_API_KEY is unset',
    async (_label, send) => {
      delete process.env.BREVO_API_KEY;
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await send();

      expect(warn).toHaveBeenCalled();
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    },
  );

  it.each(senders)(
    'sends the %s via Brevo when configured',
    async (_l, send) => {
      process.env.BREVO_API_KEY = 'test-key';

      await send();

      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);
      const [call] = mockSendTransacEmail.mock.calls[0];
      expect(call.subject).toBeTruthy();
      expect(call.sender.email).toBe('no-reply@example.com');
    },
  );

  it('uses the configured sender identity', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    process.env.EMAIL_FROM_ADDRESS = 'hello@gaffer.test';
    process.env.EMAIL_FROM_NAME = 'Gaffer';

    await sendAssistantInviteEmail({
      to: 'assistant@example.com',
      url: 'https://app.test/invite',
    });

    const [{ sender }] = mockSendTransacEmail.mock.calls[0];
    expect(sender).toEqual({ name: 'Gaffer', email: 'hello@gaffer.test' });
  });

  it('escapes the player name and link in a claim invite', async () => {
    process.env.BREVO_API_KEY = 'test-key';

    await sendPlayerClaimInviteEmail({
      to: 'player@example.com',
      playerName: '<img onerror=alert(1)>',
      url: 'https://app.test/claim?a=1&b=2',
    });

    const [{ htmlContent, to }] = mockSendTransacEmail.mock.calls[0];
    expect(htmlContent).not.toContain('<img');
    expect(htmlContent).toContain('&lt;img');
    expect(htmlContent).toContain('a=1&amp;b=2');
    // The recipient header keeps the raw name; only the HTML body is escaped.
    expect(to).toEqual([
      { email: 'player@example.com', name: '<img onerror=alert(1)>' },
    ]);
  });

  it('falls back to a generic greeting when the player has no name', async () => {
    process.env.BREVO_API_KEY = 'test-key';

    await sendPlayerClaimInviteEmail({
      to: 'player@example.com',
      playerName: '',
      url: 'https://app.test/claim',
    });

    const [{ htmlContent }] = mockSendTransacEmail.mock.calls[0];
    expect(htmlContent).toContain('Hi Player,');
  });

  it('distinguishes an approved verification from a declined one', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const base = {
      to: 'coach@example.com',
      competitionName: 'Sunday League',
      teamName: 'Rovers FC',
      url: 'https://app.test/competition',
    };

    await sendCompetitionTeamReviewOutcomeEmail({ ...base, approved: true });
    await sendCompetitionTeamReviewOutcomeEmail({ ...base, approved: false });

    const [approved] = mockSendTransacEmail.mock.calls[0];
    const [declined] = mockSendTransacEmail.mock.calls[1];
    expect(approved.subject).toContain('approved');
    expect(approved.htmlContent).toContain('approved');
    expect(declined.subject).toContain('declined');
    expect(declined.htmlContent).toContain('declined');
  });

  it('reuses one Brevo client across sends', async () => {
    process.env.BREVO_API_KEY = 'test-key';

    await sendAssistantInviteEmail({ to: 'a@example.com', url: 'https://a' });
    await sendAssistantInviteEmail({ to: 'b@example.com', url: 'https://b' });

    expect(MockedBrevoClient).toHaveBeenCalledTimes(1);
    expect(mockSendTransacEmail).toHaveBeenCalledTimes(2);
  });
});
