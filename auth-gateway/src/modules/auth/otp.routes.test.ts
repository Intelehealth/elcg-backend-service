import request from 'supertest';
import { createApp } from '@/app';
import * as authRepository from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider } from '@/modules/otp/providers';
import * as emailModule from '@/modules/otp/email';
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
const app = createApp();
const sendMock = jest.fn().mockResolvedValue('123456');

beforeEach(() => {
  jest.clearAllMocks();
  sendMock.mockResolvedValue('123456');
  mockedSelectProvider.mockReturnValue({ send: sendMock });
  mockedEmail.sendOtpEmail.mockResolvedValue(undefined);
  mockedEmail.sendUsernameEmail.mockResolvedValue(undefined);
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
      .send({ otpFor: 'verification', phoneNumber: PHONE });
    expect(res.status).toBe(400);
  });

  it('rejects a request with none of phoneNumber/email/username', async () => {
    const res = await request(app).post('/auth/requestOtp').send({ otpFor: 'password' });
    expect(res.status).toBe(400);
  });

  it('otpFor: "username" always returns a generic 200, whether or not a phone matched an account — no enumeration signal', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID, username: 'nurse01', systemId: 'SYS01' },
      phoneNumber: PHONE,
      countryCode: '91',
      email: null,
      providerUuid: 'provider-uuid',
      role: 'Nurse',
      roleUuid: 'role-uuid',
    } as never);

    const res = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'username', phoneNumber: PHONE, countryCode: '91' });

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalled();

    mockedAuthRepo.findAccountByContact.mockResolvedValue(null);
    sendMock.mockClear();

    const res2 = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'username', phoneNumber: '0000000000' });

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual(res.body);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('otpFor: "password" deliberately returns userUuid/providerUuid/role/roleUuid for a matched account, matching legacy — an accepted enumeration trade-off for this purpose only', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID, username: 'nurse01', systemId: 'SYS01' },
      phoneNumber: PHONE,
      countryCode: '91',
      email: null,
      providerUuid: 'provider-uuid',
      role: 'Nurse',
      roleUuid: 'role-uuid',
    } as never);

    const res = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'password', phoneNumber: PHONE, countryCode: '91' });

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalled();
    expect(res.body).toEqual({
      message: 'The OTP has been sent.',
      userUuid: USER_UUID,
      providerUuid: 'provider-uuid',
      role: 'Nurse',
      roleUuid: 'role-uuid',
    });

    mockedAuthRepo.findAccountByContact.mockResolvedValue(null);
    sendMock.mockClear();

    const res2 = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'password', phoneNumber: '0000000000' });

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ message: 'The OTP has been sent.' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('accepts otpFor: "username" with an email and no phoneNumber', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue({
      user: { userId: 42, personId: 7, uuid: USER_UUID, username: 'nurse01', systemId: 'SYS01' },
      phoneNumber: null,
      countryCode: null,
      email: 'nurse01@example.com',
    } as never);

    const res = await request(app)
      .post('/auth/requestOtp')
      .send({ otpFor: 'username', email: 'nurse01@example.com' });

    expect(res.status).toBe(200);
  });
});

describe('POST /auth/verifyOtp', () => {
  it('rejects a malformed request with 400', async () => {
    const res = await request(app).post('/auth/verifyOtp').send({ phoneNumber: PHONE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns userUuid + resetToken on a correct code', async () => {
    mockedAuthRepo.findAccountByContact.mockResolvedValue({
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
    mockedAuthRepo.findAccountByContact.mockResolvedValue({
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
