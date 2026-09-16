import nodemailer from 'nodemailer';
import { env } from '@/config/env';
import { EmailProviderError, sendOtpEmail, sendUsernameEmail } from '@/modules/otp/email';

jest.mock('nodemailer');

const mockedNodemailer = jest.mocked(nodemailer);
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'mock-id' });

const ORIGINAL_ENV = {
  MAIL_USERNAME: env.MAIL_USERNAME,
  MAIL_PASSWORD: env.MAIL_PASSWORD,
  OAUTH_CLIENT_ID: env.OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET: env.OAUTH_CLIENT_SECRET,
  OAUTH_CLIENT_REFRESH_TOKEN: env.OAUTH_CLIENT_REFRESH_TOKEN,
};

function configureMailEnv(): void {
  env.MAIL_USERNAME = 'noreply@example.org';
  env.MAIL_PASSWORD = 'app-password';
  env.OAUTH_CLIENT_ID = 'client-id';
  env.OAUTH_CLIENT_SECRET = 'client-secret';
  env.OAUTH_CLIENT_REFRESH_TOKEN = 'refresh-token';
}

function clearMailEnv(): void {
  env.MAIL_USERNAME = undefined;
  env.MAIL_PASSWORD = undefined;
  env.OAUTH_CLIENT_ID = undefined;
  env.OAUTH_CLIENT_SECRET = undefined;
  env.OAUTH_CLIENT_REFRESH_TOKEN = undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
  sendMailMock.mockResolvedValue({ messageId: 'mock-id' });
  mockedNodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock } as never);
  configureMailEnv();
});

afterAll(() => {
  Object.assign(env, ORIGINAL_ENV);
});

describe('sendOtpEmail', () => {
  it('throws EmailProviderError when mail is not configured', async () => {
    clearMailEnv();

    await expect(sendOtpEmail('nurse01@example.com', '123456', 'forgot username')).rejects.toThrow(
      EmailProviderError,
    );
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('builds a Gmail OAuth2 transport from the configured env vars', async () => {
    await sendOtpEmail('nurse01@example.com', '123456', 'forgot username');

    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith({
      pool: true,
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: 'noreply@example.org',
        pass: 'app-password',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
      },
    });
  });

  it('fills the OTP template and uses the "forgot username" subject', async () => {
    await sendOtpEmail('nurse01@example.com', '123456', 'forgot username');

    const [message] = sendMailMock.mock.calls[0];
    expect(message.from).toBe('noreply@example.org');
    expect(message.to).toBe('nurse01@example.com');
    expect(message.subject).toBe('Verification code for forgot username');
    expect(message.html).toContain('123456');
    expect(message.html).toContain('for forgot username.');
  });

  it('fills the OTP template and uses the "forgot password" subject', async () => {
    await sendOtpEmail('nurse01@example.com', '654321', 'forgot password');

    const [message] = sendMailMock.mock.calls[0];
    expect(message.subject).toBe('Verification code for forgot password');
    expect(message.html).toContain('654321');
    expect(message.html).toContain('for forgot password.');
  });
});

describe('sendUsernameEmail', () => {
  it('throws EmailProviderError when mail is not configured', async () => {
    clearMailEnv();

    await expect(sendUsernameEmail('nurse01@example.com', 'nurse01')).rejects.toThrow(
      EmailProviderError,
    );
  });

  it('fills the username template and sends the fixed subject', async () => {
    await sendUsernameEmail('nurse01@example.com', 'nurse01');

    const [message] = sendMailMock.mock.calls[0];
    expect(message.to).toBe('nurse01@example.com');
    expect(message.subject).toBe('Your account credentials at Intelehealth');
    expect(message.html).toContain('nurse01');
  });
});
