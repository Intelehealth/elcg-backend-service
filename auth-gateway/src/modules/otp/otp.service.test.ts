import * as authRepository from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider } from '@/modules/otp/providers';
import * as emailModule from '@/modules/otp/email';
import { requestOtp, resetPassword, verifyOtp } from '@/modules/otp/otp.service';
import { signPasswordResetToken } from '@/modules/jwt/jwt.service';
import { env } from '@/config/env';

jest.mock('@/modules/auth/auth.repository');
jest.mock('@/modules/otp/user-settings.repository');
jest.mock('@/modules/otp/providers');
jest.mock('@/modules/otp/email');

const mockedAuthRepo = jest.mocked(authRepository);
const mockedSettingsRepo = jest.mocked(userSettingsRepository);
const mockedSelectProvider = jest.mocked(selectProvider);
const mockedEmail = jest.mocked(emailModule);

const USER_UUID = '11111111-1111-4111-8111-111111111111';
const PHONE = '9876543210';
const EMAIL = 'nurse01@example.com';
const sendMock = jest.fn().mockResolvedValue('123456');

/** `findAccountByContact`/`findAccountByUsername`'s return shape. */
function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: 42, personId: 7, uuid: USER_UUID, username: 'nurse01', systemId: 'SYS01' },
    phoneNumber: PHONE,
    countryCode: '91',
    email: EMAIL,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendMock.mockResolvedValue('123456');
  mockedSelectProvider.mockReturnValue({ send: sendMock });
  mockedEmail.sendOtpEmail.mockResolvedValue(undefined);
  mockedEmail.sendUsernameEmail.mockResolvedValue(undefined);
});

describe('requestOtp — otpFor: "password"', () => {
  it('does nothing when no account matches phoneNumber/email/username', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(null);

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });

  it('looks up by username when given, ignoring phoneNumber/email', async () => {
    mockedAuthRepo.findAccountByUsername.mockResolvedValue(buildAccount() as never);

    await requestOtp({ otpFor: 'password', username: 'nurse01' });

    expect(mockedAuthRepo.findAccountByUsername).toHaveBeenCalledWith('nurse01');
    expect(mockedAuthRepo.findAccountByContact).not.toHaveBeenCalled();
  });

  it('falls back to the phone/email lookup when no username is given', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(mockedAuthRepo.findAccountByContact).toHaveBeenCalledWith(PHONE);
  });

  it('sends via the country-routed SMS provider and persists whatever code it returns', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    sendMock.mockResolvedValue('999999'); // e.g. 2Factor's AUTOGEN2 value, not the local one

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE, countryCode: '91' });

    expect(mockedSelectProvider).toHaveBeenCalledWith('91');
    expect(sendMock).toHaveBeenCalledWith(
      `+91${PHONE}`,
      expect.stringMatching(/^\d{6}$/),
      expect.any(Number),
    );
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(USER_UUID, '999999', 'P');
  });

  it('sends to the phone/country code on file, ignoring the request-supplied countryCode', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);

    // Client claims +1 (e.g. a stale/incorrect value); the account is really +91.
    await requestOtp({ otpFor: 'password', phoneNumber: PHONE, countryCode: '1' });

    expect(mockedSelectProvider).toHaveBeenCalledWith('91');
    expect(sendMock).toHaveBeenCalledWith(`+91${PHONE}`, expect.any(String), expect.any(Number));
  });

  it('also emails the SAME sent code when the account has both phone and email on file', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    sendMock.mockResolvedValue('999999');

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(mockedEmail.sendOtpEmail).toHaveBeenCalledWith(EMAIL, '999999', 'forgot password');
  });

  it('does not email when the account has no email on file', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount({ email: null }) as never);

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(mockedEmail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('does not persist anything when the SMS provider fails to send', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    sendMock.mockRejectedValue(new Error('provider outage'));

    await expect(requestOtp({ otpFor: 'password', phoneNumber: PHONE })).resolves.toBeUndefined();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
    expect(mockedEmail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('still persists the SMS OTP even when the follow-up email send fails', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    sendMock.mockResolvedValue('999999');
    mockedEmail.sendOtpEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(requestOtp({ otpFor: 'password', phoneNumber: PHONE })).resolves.toBeUndefined();
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(USER_UUID, '999999', 'P');
  });

  it('emails a freshly generated code when the account has email but no phone on file', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(
      buildAccount({ phoneNumber: null, countryCode: null }) as never,
    );

    await requestOtp({ otpFor: 'password', email: EMAIL });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedEmail.sendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      expect.stringMatching(/^\d{6}$/),
      'forgot password',
    );
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(
      USER_UUID,
      expect.stringMatching(/^\d{6}$/),
      'P',
    );
  });

  it('does nothing when the account has neither phone nor email on file', async () => {
    mockedAuthRepo.findAccountByUsername.mockResolvedValue(
      buildAccount({ phoneNumber: null, countryCode: null, email: null }) as never,
    );

    await requestOtp({ otpFor: 'password', username: 'nurse01' });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedEmail.sendOtpEmail).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });
});

describe('requestOtp — otpFor: "username"', () => {
  it('does nothing when no account matches the phone number/email', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(null);

    await requestOtp({ otpFor: 'username', phoneNumber: PHONE });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });

  it('texts the OTP when the request supplied a phoneNumber, persisting otpFor "U"', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    sendMock.mockResolvedValue('654321');

    await requestOtp({ otpFor: 'username', phoneNumber: PHONE });

    expect(mockedAuthRepo.findAccountByContact).toHaveBeenCalledWith(PHONE);
    expect(sendMock).toHaveBeenCalledWith(`+91${PHONE}`, expect.any(String), expect.any(Number));
    expect(mockedEmail.sendOtpEmail).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(USER_UUID, '654321', 'U');
  });

  it('emails the OTP when the request supplied an email, persisting otpFor "U"', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);

    await requestOtp({ otpFor: 'username', email: EMAIL });

    expect(mockedAuthRepo.findAccountByContact).toHaveBeenCalledWith(EMAIL);
    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedEmail.sendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      expect.stringMatching(/^\d{6}$/),
      'forgot username',
    );
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(
      USER_UUID,
      expect.stringMatching(/^\d{6}$/),
      'U',
    );
  });

  it('does nothing when the matched account has no phone on file for a phoneNumber request', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(
      buildAccount({ phoneNumber: null, countryCode: null }) as never,
    );

    await requestOtp({ otpFor: 'username', phoneNumber: PHONE });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });

  it('does nothing when the matched account has no email on file for an email request', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount({ email: null }) as never);

    await requestOtp({ otpFor: 'username', email: EMAIL });

    expect(mockedEmail.sendOtpEmail).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });
});

describe('verifyOtp', () => {
  function buildRow(overrides: Record<string, unknown> = {}) {
    return {
      userUuid: USER_UUID,
      otp: '123456',
      otpFor: 'P',
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('rejects when no account matches the phone number', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(null);

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_OTP' });
  });

  it('rejects when no row matches user+otp+purpose', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(null);

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '000000' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_OTP' });
  });

  it('rejects an expired code without clearing it', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(
      buildRow({ updatedAt: new Date(Date.now() - (env.OTP_EXPIRY_SECONDS + 5) * 1000) }) as never,
    );

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' }),
    ).rejects.toMatchObject({ status: 401, code: 'OTP_EXPIRED' });
    expect(mockedSettingsRepo.clearOtp).not.toHaveBeenCalled();
  });

  it('clears the OTP and returns userUuid + resetToken on a correct, unexpired "password" code', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow() as never);

    const result = await verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' });

    expect(mockedSettingsRepo.findOtp).toHaveBeenCalledWith(USER_UUID, '123456', 'P');
    expect(result.verified).toBe(true);
    expect(result.userUuid).toBe(USER_UUID);
    expect(result.resetToken).toEqual(expect.any(String));
    expect(mockedSettingsRepo.clearOtp).toHaveBeenCalledWith(USER_UUID);
  });

  it('looks up by username when given, for verifyFor: "password"', async () => {
    mockedAuthRepo.findAccountByUsername.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow() as never);

    await verifyOtp({ verifyFor: 'password', username: 'nurse01', otp: '123456' });

    expect(mockedAuthRepo.findAccountByUsername).toHaveBeenCalledWith('nurse01');
  });

  it('verifyFor "username": clears the OTP, emails the recovered username, and returns no userUuid/resetToken', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow({ otpFor: 'U' }) as never);

    const result = await verifyOtp({ verifyFor: 'username', email: EMAIL, otp: '123456' });

    expect(mockedSettingsRepo.findOtp).toHaveBeenCalledWith(USER_UUID, '123456', 'U');
    expect(mockedEmail.sendUsernameEmail).toHaveBeenCalledWith(EMAIL, 'nurse01');
    expect(mockedSettingsRepo.clearOtp).toHaveBeenCalledWith(USER_UUID);
    expect(result).toEqual({ verified: true });
  });

  it('verifyFor "username" falls back to systemId when the account has no username', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(
      buildAccount({ user: { userId: 42, personId: 7, uuid: USER_UUID, username: null, systemId: 'SYS01' } }) as never,
    );
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow({ otpFor: 'U' }) as never);

    await verifyOtp({ verifyFor: 'username', email: EMAIL, otp: '123456' });

    expect(mockedEmail.sendUsernameEmail).toHaveBeenCalledWith(EMAIL, 'SYS01');
  });

  it('verifyFor "username" does not email when the account has no email on file', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount({ email: null }) as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow({ otpFor: 'U' }) as never);

    const result = await verifyOtp({ verifyFor: 'username', phoneNumber: PHONE, otp: '123456' });

    expect(mockedEmail.sendUsernameEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ verified: true });
  });

  it('verifyFor "username" still resolves successfully even if the username email fails to send', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow({ otpFor: 'U' }) as never);
    mockedEmail.sendUsernameEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      verifyOtp({ verifyFor: 'username', email: EMAIL, otp: '123456' }),
    ).resolves.toEqual({ verified: true });
  });
});

describe('resetPassword', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = env.OPENMRS_REST_BASE_URL;
  const originalUser = env.OPENMRS_ADMIN_USERNAME;
  const originalPass = env.OPENMRS_ADMIN_PASSWORD;

  beforeEach(() => {
    env.OPENMRS_REST_BASE_URL = 'https://example.org';
    env.OPENMRS_ADMIN_USERNAME = 'admin';
    env.OPENMRS_ADMIN_PASSWORD = 'secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.OPENMRS_REST_BASE_URL = originalBaseUrl;
    env.OPENMRS_ADMIN_USERNAME = originalUser;
    env.OPENMRS_ADMIN_PASSWORD = originalPass;
  });

  it('rejects a resetToken minted for a different user', async () => {
    const token = signPasswordResetToken('some-other-uuid');

    await expect(
      resetPassword(USER_UUID, 'NewPassword123!', token.token),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_RESET_TOKEN' });
  });

  it('rejects when OpenMRS reset config is missing', async () => {
    env.OPENMRS_REST_BASE_URL = undefined;
    const token = signPasswordResetToken(USER_UUID);

    await expect(resetPassword(USER_UUID, 'NewPassword123!', token.token)).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });

  it('calls OpenMRS password API with Basic auth and the new password', async () => {
    const token = signPasswordResetToken(USER_UUID);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as never;

    await resetPassword(USER_UUID, 'NewPassword123!', token.token);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.org/openmrs/ws/rest/v1/password/${USER_UUID}`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
    expect(JSON.parse(options.body)).toEqual({ newPassword: 'NewPassword123!' });
  });

  it('throws OPENMRS_ERROR when the OpenMRS call fails', async () => {
    const token = signPasswordResetToken(USER_UUID);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad password' }) as never;

    await expect(resetPassword(USER_UUID, 'weak', token.token)).rejects.toMatchObject({
      status: 502,
      code: 'OPENMRS_ERROR',
    });
  });
});
