import { DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import type { Person } from '@/modules/users/person.model';

/**
 * OpenMRS `users` — the credential authority. Read-only.
 *
 * `username` is nullable: OpenMRS also lets a user sign in with `system_id`, so
 * the login lookup must match either column.
 */
export class OpenmrsUser extends Model<
  InferAttributes<OpenmrsUser>,
  InferCreationAttributes<OpenmrsUser>
> {
  declare userId: number;
  declare systemId: string;
  declare username: string | null;
  declare password: string | null;
  declare salt: string | null;
  declare personId: number;
  declare retired: boolean;
  declare uuid: string;

  declare person?: NonAttribute<Person>;
}

OpenmrsUser.init(
  {
    userId: { type: DataTypes.INTEGER, field: 'user_id', primaryKey: true },
    systemId: { type: DataTypes.STRING(50), field: 'system_id' },
    username: { type: DataTypes.STRING(50), field: 'username' },
    password: { type: DataTypes.STRING(128), field: 'password' },
    salt: { type: DataTypes.STRING(128), field: 'salt' },
    personId: { type: DataTypes.INTEGER, field: 'person_id' },
    retired: { type: DataTypes.BOOLEAN, field: 'retired' },
    uuid: { type: DataTypes.CHAR(38), field: 'uuid' },
  },
  { sequelize: openmrsSequelize, modelName: 'OpenmrsUser', tableName: 'users' },
);
