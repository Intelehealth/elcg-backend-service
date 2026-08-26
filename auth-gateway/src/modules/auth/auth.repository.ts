import { Op } from 'sequelize';
import { OpenmrsUser } from '@/modules/users/openmrs-user.model';
import { Person } from '@/modules/users/person.model';
import { PersonName } from '@/modules/users/person-name.model';
import { Provider } from '@/modules/users/provider.model';
import { UserRole } from '@/modules/users/user-role.model';
import { RolePrivilege } from '@/modules/users/role-privilege.model';
import { RoleRole } from '@/modules/users/role-role.model';
import {
  ProviderAttribute,
  ProviderAttributeType,
} from '@/modules/users/provider-attribute.model';

/**
 * Everything the consolidated login answers with, assembled from OpenMRS.
 *
 * The legacy mobile flow paid three round-trips for this: `/auth/login` for a
 * token, `/session` for the user and its roles/privileges, and
 * `/provider?user={uuid}` for the provider profile. Here it is a handful of
 * indexed reads inside one request.
 */
export interface OpenmrsIdentity {
  user: OpenmrsUser;
  display: string;
  personUuid: string;
  gender: string | null;
  birthdate: string | null;
  roles: string[];
  privileges: string[];
  provider: {
    uuid: string;
    identifier: string | null;
    display: string | null;
    attributes: Record<string, string>;
  } | null;
}

/** OpenMRS accepts either `username` or `system_id` at the login prompt. */
export async function findUserByLogin(login: string): Promise<OpenmrsUser | null> {
  return OpenmrsUser.findOne({
    where: {
      retired: false,
      [Op.or]: [{ username: login }, { systemId: login }],
    },
    include: [
      {
        model: Person,
        as: 'person',
        required: false,
        include: [{ model: PersonName, as: 'names', required: false, where: { voided: false } }],
      },
    ],
  });
}

export async function findUserByUuid(uuid: string): Promise<OpenmrsUser | null> {
  return OpenmrsUser.findOne({
    where: { uuid, retired: false },
    include: [
      {
        model: Person,
        as: 'person',
        required: false,
        include: [{ model: PersonName, as: 'names', required: false, where: { voided: false } }],
      },
    ],
  });
}

function pickDisplayName(user: OpenmrsUser): string {
  const names = user.person?.names ?? [];
  const chosen = names.find((name) => name.preferred) ?? names[0];
  const display = chosen?.display.trim();
  // Fall back to the login handle rather than returning an empty string.
  return display && display.length > 0 ? display : (user.username ?? user.systemId);
}

async function findRoles(userId: number): Promise<string[]> {
  const rows = await UserRole.findAll({ where: { userId } });
  return rows.map((row) => row.role);
}

/** Depth guard — OpenMRS does not forbid a cycle in `role_role`. */
const MAX_ROLE_DEPTH = 10;

/**
 * Walks `role_role` upwards to collect every role a user effectively holds.
 *
 * Assigned roles carry no privileges directly in this database: `Organizational:
 * Nurse` inherits from `Application: …` roles, which inherit from
 * `Privilege Level: …`, where the privileges actually live.
 */
async function expandRoles(assignedRoles: string[]): Promise<string[]> {
  const seen = new Set(assignedRoles);
  let frontier = assignedRoles;

  for (let depth = 0; depth < MAX_ROLE_DEPTH && frontier.length > 0; depth++) {
    const rows = await RoleRole.findAll({ where: { childRole: { [Op.in]: frontier } } });
    const parents = rows.map((row) => row.parentRole).filter((role) => !seen.has(role));
    parents.forEach((role) => seen.add(role));
    frontier = [...new Set(parents)];
  }

  return [...seen];
}

async function findPrivileges(roles: string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const effectiveRoles = await expandRoles(roles);
  const rows = await RolePrivilege.findAll({ where: { role: { [Op.in]: effectiveRoles } } });
  return [...new Set(rows.map((row) => row.privilege))].sort();
}

async function findProviderAttributes(providerId: number): Promise<Record<string, string>> {
  const rows = await ProviderAttribute.findAll({
    where: { providerId, voided: false },
    include: [{ model: ProviderAttributeType, as: 'attributeType', required: false }],
  });

  const attributes: Record<string, string> = {};
  for (const row of rows) {
    const name = row.attributeType?.name;
    if (name && row.valueReference !== null) {
      attributes[name] = row.valueReference;
    }
  }
  return attributes;
}

/**
 * Loads the provider profile hanging off the same `person_id` as the user.
 *
 * `provider.name` is NULL for 436 of the 438 active providers in this database,
 * so it cannot be the display source on its own. The legacy endpoint did not use
 * it either — `v=custom:(uuid,person:(uuid,display,…))` returned the *person's*
 * name. Since the provider shares `person_id` with the user, that is the display
 * we already resolved, passed in here as the fallback.
 */
async function findProvider(
  personId: number,
  personDisplay: string,
): Promise<OpenmrsIdentity['provider']> {
  const provider = await Provider.findOne({ where: { personId, retired: false } });
  if (!provider) return null;

  const name = provider.name?.trim();

  return {
    uuid: provider.uuid,
    identifier: provider.identifier,
    display: name && name.length > 0 ? name : personDisplay,
    attributes: await findProviderAttributes(provider.providerId),
  };
}

/**
 * Assembles the full identity for an already-authenticated user. Roles,
 * privileges and the provider profile are independent reads, so they run
 * concurrently rather than in sequence.
 */
export async function loadIdentity(user: OpenmrsUser): Promise<OpenmrsIdentity> {
  const display = pickDisplayName(user);
  const roles = await findRoles(user.userId);
  const [privileges, provider] = await Promise.all([
    findPrivileges(roles),
    findProvider(user.personId, display),
  ]);

  return {
    user,
    display,
    personUuid: user.person?.uuid ?? '',
    gender: user.person?.gender ?? null,
    birthdate: user.person?.birthdate ?? null,
    roles,
    privileges,
    provider,
  };
}
