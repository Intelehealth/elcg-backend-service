import * as authRepository from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider } from '@/modules/otp/providers';
import { requestOtp, resetPassword, verifyOtp } from '@/modules/otp/otp.service';
import { signPasswordResetToken } from '@/modules/jwt/jwt.service';
import { env } from '@/config/env';

jest.mock('@/modules/auth/auth.repository');
jest.mock('@/modules/otp/user-settings.repository');
jest.mock('@/modules/otp/providers');

const mockedAuthRepo = jest.mocked(authRepository);
const mockedSettingsRepo = jest.mocked(userSettingsRepository);
const mockedSelectProvider = jest.mocked(selectProvider);

const USER_UUID = '11111111-1111-4111-8111-111111111111';
const PHONE = '9876543210';
const sendMock = jest.fn().mockResolvedValue('123456');

/** `findAccountByPhoneNumber`'s return shape: the user plus its phone on file. */
function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: 42, personId: 7, uuid: USER_UUID, username: 'nurse01' },
    phoneNumber: PHONE,
    countryCode: '91',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendMock.mockResolvedValue('123456');
  mockedSelectProvider.mockReturnValue({ send: sendMock });
});

describe('requestOtp', () => {
  it('does nothing when no account matches the phone number', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(null);

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });

  it('does nothing when the matched account has no phone on file', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(
      buildAccount({ phoneNumber: null, countryCode: null }) as never,
    );

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE });

    expect(sendMock).not.toHaveBeenCalled();
    expect(mockedSettingsRepo.saveOtp).not.toHaveBeenCalled();
  });

  it('sends via the country-routed provider and persists whatever code it returns', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);
    sendMock.mockResolvedValue('999999'); // e.g. 2Factor's AUTOGEN2 value, not the local one

    await requestOtp({ otpFor: 'password', phoneNumber: PHONE, countryCode: '91' });

    expect(mockedAuthRepo.findAccountByPhoneNumber).toHaveBeenCalledWith(PHONE);
    expect(mockedSelectProvider).toHaveBeenCalledWith('91');
    expect(sendMock).toHaveBeenCalledWith(
      `+91${PHONE}`,
      expect.stringMatching(/^\d{6}$/),
      expect.any(Number),
    );
    expect(mockedSettingsRepo.saveOtp).toHaveBeenCalledWith(USER_UUID, '999999', 'P');
  });

  it('sends to the phone/country code on file, ignoring the request-supplied countryCode', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);

    // Client claims +1 (e.g. a stale/incorrect value); the account is really +91.
    await requestOtp({ otpFor: 'password', phoneNumber: PHONE, countryCode: '1' });

    expect(mockedSelectProvider).toHaveBeenCalledWith('91');
    expect(sendMock).toHaveBeenCalledWith(`+91${PHONE}`, expect.any(String), expect.any(Number));
  });

  it('does not persist anything when the SMS provider fails to send', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);
    sendMock.mockRejectedValue(new Error('provider outage'));

    await expect(
      requestOtp({ otpFor: 'password', phoneNumber: PHONE }),
    ).resolves.toBeUndefined();
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
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(null);

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_OTP' });
  });

  it('rejects when no row matches user+otp+purpose', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(null);

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '000000' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_OTP' });
  });

  it('rejects an expired code without clearing it', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(
      buildRow({ updatedAt: new Date(Date.now() - (env.OTP_EXPIRY_SECONDS + 5) * 1000) }) as never,
    );

    await expect(
      verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' }),
    ).rejects.toMatchObject({ status: 401, code: 'OTP_EXPIRED' });
    expect(mockedSettingsRepo.clearOtp).not.toHaveBeenCalled();
  });

  it('clears the OTP and returns userUuid + resetToken on a correct, unexpired code', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(buildAccount() as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(buildRow() as never);

    const result = await verifyOtp({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' });

    expect(result.verified).toBe(true);
    expect(result.userUuid).toBe(USER_UUID);
    expect(result.resetToken).toEqual(expect.any(String));
    expect(mockedSettingsRepo.clearOtp).toHaveBeenCalledWith(USER_UUID);
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
