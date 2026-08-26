import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `user_role` — join table, composite key. Read-only. */
export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare userId: number;
  declare role: string;
}

UserRole.init(
  {
    userId: { type: DataTypes.INTEGER, field: 'user_id', primaryKey: true },
    role: { type: DataTypes.STRING(50), field: 'role', primaryKey: true },
  },
  { sequelize: openmrsSequelize, modelName: 'UserRole', tableName: 'user_role' },
);
