import { saveOtp } from '@/modules/otp/user-settings.repository';
import { UserSettings } from '@/modules/otp/user-settings.model';

jest.mock('@/modules/otp/user-settings.model');

describe('saveOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the row for a user who has none yet (new user, never subscribed)', async () => {
    jest.mocked(UserSettings.findOne).mockResolvedValue(null);

    await saveOtp('user-uuid', '123456', 'P');

    expect(UserSettings.create).toHaveBeenCalledWith({ userUuid: 'user-uuid', otp: '123456', otpFor: 'P' });
  });

  it('updates the existing row in place', async () => {
    const row = { otp: 'old', otpFor: 'U', save: jest.fn() };
    jest.mocked(UserSettings.findOne).mockResolvedValue(row as never);

    await saveOtp('user-uuid', '654321', 'P');

    expect(row).toMatchObject({ otp: '654321', otpFor: 'P' });
    expect(row.save).toHaveBeenCalled();
    expect(UserSettings.create).not.toHaveBeenCalled();
  });
});
