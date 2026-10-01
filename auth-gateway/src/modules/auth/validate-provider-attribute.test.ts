import request from 'supertest';
import { createApp } from '@/app';
import * as authRepository from '@/modules/auth/auth.repository';

jest.mock('@/modules/auth/auth.repository');

const mockedAuthRepo = jest.mocked(authRepository);
const app = createApp();
const body = { attributeType: 'emailId', attributeValue: 'demo@example.com', providerUuid: 'p-1' };

beforeEach(() => jest.clearAllMocks());

describe('POST /auth/validateProviderAttribute', () => {
  it('reports the value as available (data: true) when no other provider has it', async () => {
    mockedAuthRepo.isProviderAttributeTaken.mockResolvedValue(false);

    const res = await request(app).post('/auth/validateProviderAttribute').send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'EMAILID does not exists!', data: true });
    expect(mockedAuthRepo.isProviderAttributeTaken).toHaveBeenCalledWith('emailId', 'demo@example.com', 'p-1');
  });

  it('reports the value as taken (data: false) when another provider has it', async () => {
    mockedAuthRepo.isProviderAttributeTaken.mockResolvedValue(true);

    const res = await request(app)
      .post('/auth/validateProviderAttribute')
      .send({ ...body, attributeType: 'phoneNumber', attributeValue: '9503692181' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'PHONENUMBER already exists!', data: false });
  });

  it('accepts a numeric attributeValue', async () => {
    mockedAuthRepo.isProviderAttributeTaken.mockResolvedValue(false);

    await request(app)
      .post('/auth/validateProviderAttribute')
      .send({ ...body, attributeType: 'phoneNumber', attributeValue: 9503692181 });

    expect(mockedAuthRepo.isProviderAttributeTaken).toHaveBeenCalledWith('phoneNumber', '9503692181', 'p-1');
  });

  it.each([{}, { ...body, providerUuid: '' }, { ...body, attributeValue: '' }])(
    'rejects missing/blank arguments with legacy\'s 400 body: %j',
    async (payload) => {
      const res = await request(app).post('/auth/validateProviderAttribute').send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, message: 'Bad request! Invalid arguments.', data: null });
      expect(mockedAuthRepo.isProviderAttributeTaken).not.toHaveBeenCalled();
    },
  );

  it('rejects an attributeType other than emailId/phoneNumber', async () => {
    const res = await request(app)
      .post('/auth/validateProviderAttribute')
      .send({ ...body, attributeType: 'address' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Bad request! Attribute type should be emailId/phoneNumber.',
      data: null,
    });
    expect(mockedAuthRepo.isProviderAttributeTaken).not.toHaveBeenCalled();
  });
});
