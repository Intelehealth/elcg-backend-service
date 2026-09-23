import { DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import type { Person } from '@/modules/users/person.model';

/**
 * OpenMRS `provider` — joined to the user through `person_id`, which is why the
 * legacy mobile flow needed a second call once it had the session. Read-only.
 */
export class Provider extends Model<InferAttributes<Provider>, InferCreationAttributes<Provider>> {
  declare providerId: number;
  declare personId: number;
  declare name: string | null;
  declare identifier: string | null;
  declare retired: boolean;
  declare uuid: string;
  /** FK into `providermanagement_provider_role` — null when no role is assigned. */
  declare providerRoleId: number | null;

  declare person?: NonAttribute<Person>;
}

Provider.init(
  {
    providerId: { type: DataTypes.INTEGER, field: 'provider_id', primaryKey: true },
    personId: { type: DataTypes.INTEGER, field: 'person_id' },
    name: { type: DataTypes.STRING(255), field: 'name' },
    identifier: { type: DataTypes.STRING(255), field: 'identifier' },
    retired: { type: DataTypes.BOOLEAN, field: 'retired' },
    uuid: { type: DataTypes.CHAR(38), field: 'uuid' },
    providerRoleId: { type: DataTypes.INTEGER, field: 'provider_role_id' },
  },
  { sequelize: openmrsSequelize, modelName: 'Provider', tableName: 'provider' },
);
