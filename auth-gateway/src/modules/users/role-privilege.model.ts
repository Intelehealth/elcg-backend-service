import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/**
 * OpenMRS `role_privilege`. Resolving a user's privileges is what made the legacy
 * `GET /session` response useful to the clients, so the consolidated login
 * reproduces it rather than making callers ask separately.
 */
export class RolePrivilege extends Model<
  InferAttributes<RolePrivilege>,
  InferCreationAttributes<RolePrivilege>
> {
  declare role: string;
  declare privilege: string;
}

RolePrivilege.init(
  {
    role: { type: DataTypes.STRING(50), field: 'role', primaryKey: true },
    privilege: { type: DataTypes.STRING(255), field: 'privilege', primaryKey: true },
  },
  { sequelize: openmrsSequelize, modelName: 'RolePrivilege', tableName: 'role_privilege' },
);
