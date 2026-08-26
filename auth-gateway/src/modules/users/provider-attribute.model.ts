import { DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `provider_attribute_type` — supplies the attribute's display name. */
export class ProviderAttributeType extends Model<
  InferAttributes<ProviderAttributeType>,
  InferCreationAttributes<ProviderAttributeType>
> {
  declare providerAttributeTypeId: number;
  declare name: string;
  declare retired: boolean;
}

ProviderAttributeType.init(
  {
    providerAttributeTypeId: {
      type: DataTypes.INTEGER,
      field: 'provider_attribute_type_id',
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(255), field: 'name' },
    retired: { type: DataTypes.BOOLEAN, field: 'retired' },
  },
  {
    sequelize: openmrsSequelize,
    modelName: 'ProviderAttributeType',
    tableName: 'provider_attribute_type',
  },
);

/**
 * OpenMRS `provider_attribute` — the values the legacy `/provider?v=custom:(…,attributes)`
 * projection returned. Flattened to a `{ typeName: value }` map for the client.
 */
export class ProviderAttribute extends Model<
  InferAttributes<ProviderAttribute>,
  InferCreationAttributes<ProviderAttribute>
> {
  declare providerAttributeId: number;
  declare providerId: number;
  declare attributeTypeId: number;
  declare valueReference: string | null;
  declare voided: boolean;

  declare attributeType?: NonAttribute<ProviderAttributeType>;
}

ProviderAttribute.init(
  {
    providerAttributeId: { type: DataTypes.INTEGER, field: 'provider_attribute_id', primaryKey: true },
    providerId: { type: DataTypes.INTEGER, field: 'provider_id' },
    attributeTypeId: { type: DataTypes.INTEGER, field: 'attribute_type_id' },
    valueReference: { type: DataTypes.TEXT, field: 'value_reference' },
    voided: { type: DataTypes.BOOLEAN, field: 'voided' },
  },
  { sequelize: openmrsSequelize, modelName: 'ProviderAttribute', tableName: 'provider_attribute' },
);
