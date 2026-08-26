/**
 * Model registry. Importing this module registers every Sequelize model on the
 * connection it belongs to and wires the associations. `app.ts` imports it once
 * so both the server and Supertest-driven tests get a fully initialised ORM.
 *
 * Two schemas, deliberately kept apart:
 *   • openmrs         — identity (users, provider, person, …). Read-only bar `user_property`.
 *   • mindmap_server  — sessions (refresh_tokens).
 *
 * Associations are only ever declared *within* a connection; MySQL cannot join
 * across schemas through Sequelize, which is why the token tables key on
 * `user_uuid` rather than a foreign key.
 */
import { OpenmrsUser } from '@/modules/users/openmrs-user.model';
import { Person } from '@/modules/users/person.model';
import { PersonName } from '@/modules/users/person-name.model';
import { Provider } from '@/modules/users/provider.model';
import { UserRole } from '@/modules/users/user-role.model';
import { UserProperty } from '@/modules/users/user-property.model';
import { RolePrivilege } from '@/modules/users/role-privilege.model';
import { RoleRole } from '@/modules/users/role-role.model';
import {
  ProviderAttribute,
  ProviderAttributeType,
} from '@/modules/users/provider-attribute.model';
import { RefreshToken } from '@/modules/jwt/refresh-token.model';

// ── OpenMRS schema ────────────────────────────────────────────────────────────
OpenmrsUser.belongsTo(Person, { foreignKey: 'personId', targetKey: 'personId', as: 'person' });
Person.hasMany(PersonName, { foreignKey: 'personId', sourceKey: 'personId', as: 'names' });
Provider.belongsTo(Person, { foreignKey: 'personId', targetKey: 'personId', as: 'person' });
ProviderAttribute.belongsTo(ProviderAttributeType, {
  foreignKey: 'attributeTypeId',
  targetKey: 'providerAttributeTypeId',
  as: 'attributeType',
});

export {
  OpenmrsUser,
  Person,
  PersonName,
  Provider,
  UserRole,
  UserProperty,
  RolePrivilege,
  RoleRole,
  ProviderAttribute,
  ProviderAttributeType,
  RefreshToken,
};
