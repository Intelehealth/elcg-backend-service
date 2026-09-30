import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `role` — the named role (`Organizational: Nurse`, …) and its uuid. Read-only. */
export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare role: string;
  declare uuid: string;
}

Role.init(
  {
    role: { type: DataTypes.STRING(50), field: 'role', primaryKey: true },
    uuid: { type: DataTypes.CHAR(38), field: 'uuid' },
  },
  { sequelize: openmrsSequelize, modelName: 'Role', tableName: 'role' },
);
