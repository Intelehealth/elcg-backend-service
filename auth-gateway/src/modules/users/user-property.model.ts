import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/**
 * OpenMRS `user_property` — key/value store hanging off a user.
 *
 * This is the one OpenMRS table the gateway writes to. OpenMRS core already uses
 * `loginAttempts` and `lockoutTimestamp` here for its own lockout, so reusing the
 * same keys keeps a single counter across both the legacy webapp and eLCG rather
 * than letting each maintain its own idea of "locked".
 */
export class UserProperty extends Model<
  InferAttributes<UserProperty>,
  InferCreationAttributes<UserProperty>
> {
  declare userId: number;
  declare property: string;
  declare propertyValue: string | null;
}

export const LOGIN_ATTEMPTS_PROPERTY = 'loginAttempts';
export const LOCKOUT_TIMESTAMP_PROPERTY = 'lockoutTimestamp';

UserProperty.init(
  {
    userId: { type: DataTypes.INTEGER, field: 'user_id', primaryKey: true },
    property: { type: DataTypes.STRING(100), field: 'property', primaryKey: true },
    propertyValue: { type: DataTypes.STRING(255), field: 'property_value' },
  },
  { sequelize: openmrsSequelize, modelName: 'UserProperty', tableName: 'user_property' },
);
