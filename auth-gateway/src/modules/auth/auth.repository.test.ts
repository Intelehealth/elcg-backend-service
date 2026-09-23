import { Op } from 'sequelize';
import {
  findAccountByContact,
  findAccountByPhoneNumber,
  findAccountByUsername,
  findUserByLogin,
  findUserByUuid,
  loadIdentity,
} from '@/modules/auth/auth.repository';
import { OpenmrsUser } from '@/modules/users/openmrs-user.model';
import { UserRole } from '@/modules/users/user-role.model';
import { RoleRole } from '@/modules/users/role-role.model';
import { RolePrivilege } from '@/modules/users/role-privilege.model';
import { Provider } from '@/modules/users/provider.model';
import { ProviderAttribute } from '@/modules/users/provider-attribute.model';
import { ProviderRole } from '@/modules/users/provider-role.model';

jest.mock('@/modules/users/openmrs-user.model');
jest.mock('@/modules/users/user-role.model');
jest.mock('@/modules/users/role-role.model');
jest.mock('@/modules/users/role-privilege.model');
jest.mock('@/modules/users/provider.model');
jest.mock('@/modules/users/provider-attribute.model');
jest.mock('@/modules/users/provider-role.model');

/**
 * Mirrors the real inheritance chain in the OpenMRS database: the roles actually
 * assigned to users hold no privileges themselves and reach them only through
 * `role_role`.
 */
const ROLE_EDGES: Record<string, string[]> = {
  'Organizational: Nurse': ['Application: Enters Vitals'],
  'Application: Enters Vitals': ['Privilege Level: High'],
};
const PRIVILEGES_BY_ROLE: Record<string, string[]> = {
  'Privilege Level: High': ['View Patients', 'Add Encounters'],
};

function buildUser(): OpenmrsUser {
  return {
    userId: 42,
    personId: 7,
    uuid: 'user-uuid',
    username: 'nurse01',
    systemId: '42-3',
    person: {
      uuid: 'person-uuid',
      gender: 'F',
      birthdate: '1990-04-01',
      names: [{ preferred: true, display: 'Asha Devi' }],
    },
  } as unknown as OpenmrsUser;
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(UserRole.findAll).mockResolvedValue([{ role: 'Organizational: Nurse' }] as never);

  jest.mocked(RoleRole.findAll).mockImplementation((options) => {
    const children = (options?.where as Record<string, Record<symbol, string[]>>).childRole[
      Op.in
    ] as string[];
    const parents = children.flatMap((child) => ROLE_EDGES[child] ?? []);
    return Promise.resolve(parents.map((parentRole) => ({ parentRole }))) as never;
  });

  jest.mocked(RolePrivilege.findAll).mockImplementation((options) => {
    const roles = (options?.where as Record<string, Record<symbol, string[]>>).role[
      Op.in
    ] as string[];
    const privileges = roles.flatMap((role) =>
      (PRIVILEGES_BY_ROLE[role] ?? []).map((privilege) => ({ role, privilege })),
    );
    return Promise.resolve(privileges) as never;
  });

  jest.mocked(ProviderAttribute.findAll).mockResolvedValue([] as never);
});

describe('loadIdentity — privilege inheritance', () => {
  it('walks role_role to reach privileges the assigned role does not hold directly', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);

    const identity = await loadIdentity(buildUser());

    // Assigned roles are reported as-is...
    expect(identity.roles).toEqual(['Organizational: Nurse']);
    // ...but privileges come from two levels up the inheritance chain.
    expect(identity.privileges).toEqual(['Add Encounters', 'View Patients']);
  });

  it('does not loop forever when role_role contains a cycle', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);
    jest.mocked(RoleRole.findAll).mockImplementation((options) => {
      const children = (options?.where as Record<string, Record<symbol, string[]>>).childRole[
        Op.in
      ] as string[];
      // A ↔ B cycle: every role points back at the other.
      const parents = children.map((child) => (child === 'A' ? 'B' : 'A'));
      return Promise.resolve(parents.map((parentRole) => ({ parentRole }))) as never;
    });
    jest.mocked(UserRole.findAll).mockResolvedValue([{ role: 'A' }] as never);

    await expect(loadIdentity(buildUser())).resolves.toBeDefined();
  });
});

describe('loadIdentity — provider display', () => {
  it('falls back to the person name when provider.name is null', async () => {
    // 436 of 438 active providers in the real database look exactly like this.
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      uuid: 'provider-uuid',
      identifier: '42-3',
      name: null,
    } as never);

    const identity = await loadIdentity(buildUser());

    expect(identity.provider?.display).toBe('Asha Devi');
    expect(identity.provider?.display).toBe(identity.display);
  });

  it('prefers provider.name when it is populated', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      uuid: 'provider-uuid',
      identifier: '42-3',
      name: 'Clinic Provider Name',
    } as never);

    const identity = await loadIdentity(buildUser());

    expect(identity.provider?.display).toBe('Clinic Provider Name');
  });

  it('returns null when the user has no provider row', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);

    const identity = await loadIdentity(buildUser());

    expect(identity.provider).toBeNull();
  });

  it('maps provider attribute rows to a { typeName: value } record, skipping voided-out or nameless ones', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      uuid: 'provider-uuid',
      identifier: '42-3',
      name: null,
    } as never);
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([
      { attributeType: { name: 'Phone Number' }, valueReference: '9999999999' },
      // No matching attributeType include (e.g. a retired type) — must be skipped, not throw.
      { attributeType: undefined, valueReference: 'ignored' },
      // A defined type but a null value on file — also skipped.
      { attributeType: { name: 'Country Code' }, valueReference: null },
    ] as never);

    const identity = await loadIdentity(buildUser());

    expect(identity.provider?.attributes).toEqual({ 'Phone Number': '9999999999' });
  });
});

describe('findUserByLogin', () => {
  it('matches either username or system_id on an active account', async () => {
    const user = buildUser();
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);

    const result = await findUserByLogin('nurse01');

    expect(result).toBe(user);
    const call = jest.mocked(OpenmrsUser.findOne).mock.calls[0][0];
    expect(call?.where).toMatchObject({
      retired: false,
      [Op.or]: [{ username: 'nurse01' }, { systemId: 'nurse01' }],
    });
  });

  it('returns null when nothing matches', async () => {
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(null);

    await expect(findUserByLogin('ghost')).resolves.toBeNull();
  });
});

describe('findUserByUuid', () => {
  it('looks up an active account by uuid', async () => {
    const user = buildUser();
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);

    const result = await findUserByUuid('user-uuid');

    expect(result).toBe(user);
    const call = jest.mocked(OpenmrsUser.findOne).mock.calls[0][0];
    expect(call?.where).toMatchObject({ uuid: 'user-uuid', retired: false });
  });

  it('returns null when the uuid does not exist', async () => {
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(null);

    await expect(findUserByUuid('missing-uuid')).resolves.toBeNull();
  });
});

describe('findAccountByPhoneNumber', () => {
  beforeEach(() => {
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([] as never);
  });

  it('returns null when no provider attribute has that phone number on file', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue(null);

    await expect(findAccountByPhoneNumber('9999999999')).resolves.toBeNull();
  });

  it('returns null when the matched attribute has no active provider', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({
      providerId: 1,
      valueReference: '9999999999',
    } as never);
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);

    await expect(findAccountByPhoneNumber('9999999999')).resolves.toBeNull();
  });

  it('returns null when the provider has no active user', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({
      providerId: 1,
      valueReference: '9999999999',
    } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(null);

    await expect(findAccountByPhoneNumber('9999999999')).resolves.toBeNull();
  });

  it('resolves the account and its phone/country-code attributes on a full match', async () => {
    const user = buildUser();
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({
      providerId: 1,
      valueReference: '9999999999',
    } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([
      { attributeType: { name: 'phoneNumber' }, valueReference: '9999999999' },
      { attributeType: { name: 'countryCode' }, valueReference: '91' },
    ] as never);

    const result = await findAccountByPhoneNumber('9999999999');

    expect(result).toEqual({ user, phoneNumber: '9999999999', countryCode: '91' });
  });

  it('defaults phoneNumber/countryCode to null when neither attribute is on file', async () => {
    const user = buildUser();
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({
      providerId: 1,
      valueReference: '9999999999',
    } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);

    const result = await findAccountByPhoneNumber('9999999999');

    expect(result).toEqual({ user, phoneNumber: null, countryCode: null });
  });
});

describe('findAccountByContact', () => {
  beforeEach(() => {
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([] as never);
  });

  it('returns null when no provider attribute (phone or email) has that value on file', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue(null);

    await expect(findAccountByContact('nurse01@example.com')).resolves.toBeNull();
  });

  it('returns null when the matched attribute has no active provider', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({ providerId: 1 } as never);
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);

    await expect(findAccountByContact('9999999999')).resolves.toBeNull();
  });

  it('returns null when the provider has no active user', async () => {
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({ providerId: 1 } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({ providerId: 1, personId: 7 } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(null);

    await expect(findAccountByContact('9999999999')).resolves.toBeNull();
  });

  it('resolves every contact detail on file, not just the one that matched (an email match still returns the phone)', async () => {
    const user = buildUser();
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({ providerId: 1 } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
      uuid: 'provider-uuid',
      providerRoleId: null,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([
      { attributeType: { name: 'phoneNumber' }, valueReference: '9999999999' },
      { attributeType: { name: 'countryCode' }, valueReference: '91' },
      { attributeType: { name: 'emailId' }, valueReference: 'nurse01@example.com' },
    ] as never);

    const result = await findAccountByContact('nurse01@example.com');

    expect(result).toEqual({
      user,
      phoneNumber: '9999999999',
      countryCode: '91',
      email: 'nurse01@example.com',
      providerUuid: 'provider-uuid',
      role: null,
      roleUuid: null,
    });
  });

  it('defaults phoneNumber/countryCode/email to null when none are on file', async () => {
    const user = buildUser();
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({ providerId: 1 } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
      uuid: 'provider-uuid',
      providerRoleId: null,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);

    const result = await findAccountByContact('9999999999');

    expect(result).toEqual({
      user,
      phoneNumber: null,
      countryCode: null,
      email: null,
      providerUuid: 'provider-uuid',
      role: null,
      roleUuid: null,
    });
  });

  it('resolves role/roleUuid from providermanagement_provider_role via provider_role_id', async () => {
    const user = buildUser();
    jest.mocked(ProviderAttribute.findOne).mockResolvedValue({ providerId: 1 } as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
      uuid: 'provider-uuid',
      providerRoleId: 9,
    } as never);
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);
    jest.mocked(ProviderRole.findOne).mockResolvedValue({ name: 'Nurse', uuid: 'role-uuid' } as never);

    const result = await findAccountByContact('9999999999');

    expect(ProviderRole.findOne).toHaveBeenCalledWith({ where: { providerRoleId: 9 } });
    expect(result?.role).toBe('Nurse');
    expect(result?.roleUuid).toBe('role-uuid');
  });
});

describe('findAccountByUsername', () => {
  beforeEach(() => {
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([] as never);
  });

  it('returns null when no user matches the username/system_id', async () => {
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(null);

    await expect(findAccountByUsername('nurse01')).resolves.toBeNull();
  });

  it('returns null when the matched user has no active provider', async () => {
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(buildUser() as never);
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);

    await expect(findAccountByUsername('nurse01')).resolves.toBeNull();
  });

  it('resolves the account and its contact details for a username match', async () => {
    const user = buildUser();
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(user as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
      uuid: 'provider-uuid',
      providerRoleId: null,
    } as never);
    jest.mocked(ProviderAttribute.findAll).mockResolvedValue([
      { attributeType: { name: 'phoneNumber' }, valueReference: '9999999999' },
      { attributeType: { name: 'countryCode' }, valueReference: '91' },
      { attributeType: { name: 'emailId' }, valueReference: 'nurse01@example.com' },
    ] as never);

    const result = await findAccountByUsername('nurse01');

    expect(result).toEqual({
      user,
      phoneNumber: '9999999999',
      countryCode: '91',
      email: 'nurse01@example.com',
      providerUuid: 'provider-uuid',
      role: null,
      roleUuid: null,
    });
  });

  it('orders the provider lookup to prefer a row with a non-null provider_role_id', async () => {
    jest.mocked(OpenmrsUser.findOne).mockResolvedValue(buildUser() as never);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      personId: 7,
      uuid: 'provider-uuid',
      providerRoleId: 3,
    } as never);

    await findAccountByUsername('nurse01');

    expect(Provider.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: 7, retired: false },
        order: expect.anything(),
      }),
    );
  });
});

describe('loadIdentity — display-name resolution', () => {
  beforeEach(() => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);
  });

  it('falls back to names[0] when no name is marked preferred', async () => {
    const user = buildUser();
    user.person!.names = [{ preferred: false, display: 'Fallback Name' } as never];

    const identity = await loadIdentity(user);

    expect(identity.display).toBe('Fallback Name');
  });

  it('falls back to the username when the person has no names at all', async () => {
    const user = buildUser();
    user.person!.names = [];

    const identity = await loadIdentity(user);

    expect(identity.display).toBe('nurse01');
  });

  it('falls back to the username when the chosen name is blank after trimming', async () => {
    const user = buildUser();
    user.person!.names = [{ preferred: true, display: '   ' } as never];

    const identity = await loadIdentity(user);

    expect(identity.display).toBe('nurse01');
  });

  it('falls back to the systemId when there are no names and no username', async () => {
    const user = { ...buildUser(), username: null } as unknown as OpenmrsUser;
    user.person!.names = [];

    const identity = await loadIdentity(user);

    expect(identity.display).toBe('42-3');
  });
});

describe('loadIdentity — user with no linked person row', () => {
  it('defaults personUuid to "" and gender/birthdate to null', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);
    const user = buildUser();
    user.person = undefined;

    const identity = await loadIdentity(user);

    expect(identity.personUuid).toBe('');
    expect(identity.gender).toBeNull();
    expect(identity.birthdate).toBeNull();
  });
});

describe('findPrivileges — no assigned roles', () => {
  it('returns no privileges without querying role_role at all', async () => {
    jest.mocked(Provider.findOne).mockResolvedValue(null as never);
    jest.mocked(UserRole.findAll).mockResolvedValue([] as never);

    const identity = await loadIdentity(buildUser());

    expect(identity.roles).toEqual([]);
    expect(identity.privileges).toEqual([]);
    expect(RoleRole.findAll).not.toHaveBeenCalled();
  });
});

describe('calculateAge (via the provider payload)', () => {
  const NOW = new Date('2024-06-15T00:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] }).setSystemTime(NOW);
    jest.mocked(Provider.findOne).mockResolvedValue({
      providerId: 1,
      uuid: 'provider-uuid',
      identifier: '42-3',
      name: null,
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function ageFor(birthdate: string): Promise<number | null> {
    const user = buildUser();
    user.person!.birthdate = birthdate;
    const identity = await loadIdentity(user);
    return identity.provider?.person.age ?? null;
  }

  it('is a year older once the birth month has already passed this year', async () => {
    await expect(ageFor('1990-03-10')).resolves.toBe(34);
  });

  it('is a year older on the birthday itself, same month and day', async () => {
    await expect(ageFor('1990-06-15')).resolves.toBe(34);
  });

  it('has not turned a year older yet, same month but a later day', async () => {
    await expect(ageFor('1990-06-20')).resolves.toBe(33);
  });

  it('has not turned a year older yet, birth month still ahead', async () => {
    await expect(ageFor('1990-09-01')).resolves.toBe(33);
  });

  it('returns null for an unparseable birthdate', async () => {
    await expect(ageFor('not-a-date')).resolves.toBeNull();
  });

  it('returns null when there is no birthdate on file at all', async () => {
    const user = buildUser();
    user.person!.birthdate = null;

    const identity = await loadIdentity(user);

    expect(identity.provider?.person.age).toBeNull();
  });
});
