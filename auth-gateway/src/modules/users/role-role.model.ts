import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/**
 * OpenMRS `role_role` — role inheritance. A **child** role inherits the
 * privileges of its **parent**.
 *
 * This matters more than it looks: the roles actually assigned to users carry no
 * privileges of their own. `Organizational: Doctor` has zero rows in
 * `role_privilege`; it inherits from `Application: …` roles, which in turn
 * inherit from `Privilege Level: High` (262 privileges). Resolving privileges
 * without walking this table returns an empty list for every real user.
 */
export class RoleRole extends Model<InferAttributes<RoleRole>, InferCreationAttributes<RoleRole>> {
  declare parentRole: string;
  declare childRole: string;
}

RoleRole.init(
  {
    parentRole: { type: DataTypes.STRING(50), field: 'parent_role', primaryKey: true },
    childRole: { type: DataTypes.STRING(50), field: 'child_role', primaryKey: true },
  },
  { sequelize: openmrsSequelize, modelName: 'RoleRole', tableName: 'role_role' },
);
