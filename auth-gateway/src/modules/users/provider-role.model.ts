import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `providermanagement_provider_role` — the role name/uuid a `Provider` points at via `providerRoleId`. */
export class ProviderRole extends Model<
  InferAttributes<ProviderRole>,
  InferCreationAttributes<ProviderRole>
> {
  declare providerRoleId: number;
  declare name: string;
  declare uuid: string;
}

ProviderRole.init(
  {
    providerRoleId: { type: DataTypes.INTEGER, field: 'provider_role_id', primaryKey: true },
    name: { type: DataTypes.STRING(255), field: 'name' },
    uuid: { type: DataTypes.CHAR(38), field: 'uuid' },
  },
  {
    sequelize: openmrsSequelize,
    modelName: 'ProviderRole',
    tableName: 'providermanagement_provider_role',
  },
);
