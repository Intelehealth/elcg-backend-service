import request from 'supertest';
import { createApp } from '@/app';
import * as authRepository from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider } from '@/modules/otp/providers';
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
const app = createApp();
const sendMock = jest.fn().mockResolvedValue('123456');

beforeEach(() => {
  jest.clearAllMocks();
  sendMock.mockResolvedValue('123456');
  mockedSelectProvider.mockReturnValue({ send: sendMock });
});

describe('POST /auth/requestOtp', () => {
  it('rejects a malformed request with 400', async () => {
    const res = await request(app).post('/auth/requestOtp').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unsupported otpFor value', async () => {
    const res = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'username', phoneNumber: PHONE });
    expect(res.status).toBe(400);
  });

  it('always returns a generic 200, whether or not a phone matched an account', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID },
      phoneNumber: PHONE,
      countryCode: '91',
    } as never);

    const res = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'password', phoneNumber: PHONE, countryCode: '91', source: 'mobile' });

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalled();

    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue(null);
    sendMock.mockClear();

    const res2 = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'password', phoneNumber: '0000000000' });

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual(res.body);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /auth/verifyOtp', () => {
  it('rejects a malformed request with 400', async () => {
    const res = await request(app).post('/auth/verifyOtp').send({ phoneNumber: PHONE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns userUuid + resetToken on a correct code', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID },
      phoneNumber: PHONE,
      countryCode: '91',
    } as never);
    mockedSettingsRepo.findOtp.mockResolvedValue({
      userUuid: USER_UUID,
      otp: '123456',
      otpFor: 'P',
      updatedAt: new Date(),
    } as never);

    const res = await request(app)
      .post('/auth/verifyOtp')
      .send({ verifyFor: 'password', phoneNumber: PHONE, otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      verified: true,
      userUuid: USER_UUID,
      resetToken: expect.any(String),
    });
    expect(mockedSettingsRepo.clearOtp).toHaveBeenCalledWith(USER_UUID);
  });

  it('returns 401 INVALID_OTP on a wrong code', async () => {
    mockedAuthRepo.findAccountByPhoneNumber.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID },
      phoneNumber: PHONE,
      countryCode: '91',
    } as never);
    mockedSettingsRepo.findOtp.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/verifyOtp')
      .send({ verifyFor: 'password', phoneNumber: PHONE, otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_OTP');
  });
});

describe('POST /auth/resetPassword/:userUuid', () => {
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

  it('rejects a malformed request with 400', async () => {
    const res = await request(app).post(`/auth/resetPassword/${USER_UUID}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a resetToken minted for a different user', async () => {
    const token = signPasswordResetToken('some-other-uuid');

    const res = await request(app)
      .post(`/auth/resetPassword/${USER_UUID}`)
      .send({ newPassword: 'NewPassword123!', resetToken: token.token });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('resets the password through OpenMRS on a valid resetToken', async () => {
    const token = signPasswordResetToken(USER_UUID);
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;

    const res = await request(app)
      .post(`/auth/resetPassword/${USER_UUID}`)
      .send({ newPassword: 'NewPassword123!', resetToken: token.token });

    expect(res.status).toBe(200);
  });
});
