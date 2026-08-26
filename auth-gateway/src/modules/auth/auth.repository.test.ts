import { Op } from 'sequelize';
import { loadIdentity } from '@/modules/auth/auth.repository';
import { UserRole } from '@/modules/users/user-role.model';
import { RoleRole } from '@/modules/users/role-role.model';
import { RolePrivilege } from '@/modules/users/role-privilege.model';
import { Provider } from '@/modules/users/provider.model';
import { ProviderAttribute } from '@/modules/users/provider-attribute.model';
import type { OpenmrsUser } from '@/modules/users/openmrs-user.model';

jest.mock('@/modules/users/user-role.model');
jest.mock('@/modules/users/role-role.model');
jest.mock('@/modules/users/role-privilege.model');
jest.mock('@/modules/users/provider.model');
jest.mock('@/modules/users/provider-attribute.model');

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

  jest.mocked(UserRole.findAll).mockResolvedValue([
    { role: 'Organizational: Nurse' },
  ] as never);

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
});
