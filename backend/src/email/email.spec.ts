import { Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';
import { __resetEmailClientForTests, sendVerificationEmail } from './email';

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
