import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '@/db/sequelize';

/**
 * `user_settings` — owned by the legacy `portal` service, not auth-gateway.
 * Deliberately shared (not forked into an auth-gateway-only table) so OTP
 * state stays unified across both services rather than split-brained during
 * the migration period — matches the proven `mindmap-api-NAS` behavior.
 *
 * No migration here: the table already exists in `mindmap_server`, created by
 * `portal`'s own migrations. This is a read/write model against it, nothing more.
 *
 * Column names are mixed-case in the real table (portal's models don't use
 * Sequelize's `underscored` option), so every field needs an explicit `field:`
 * — the connection-level `underscored: true` default (see `db/sequelize.ts`)
 * would get `otpFor`/`createdAt`/`updatedAt` wrong here.
 *
 * PRIMARY KEY is `user_uuid` — one row per user (verified against the live
 * schema: `SHOW CREATE TABLE user_settings`), upserted by `saveOtp`.
 */
export class UserSettings extends Model<
  InferAttributes<UserSettings>,
  InferCreationAttributes<UserSettings>
> {
  declare userUuid: string;
  declare otp: string | null;
  declare otpFor: 'U' | 'P' | 'A' | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserSettings.init(
  {
    userUuid: { type: DataTypes.STRING(100), field: 'user_uuid', primaryKey: true },
    otp: { type: DataTypes.STRING(10), field: 'otp', allowNull: true },
    otpFor: { type: DataTypes.ENUM('U', 'P', 'A'), field: 'otpFor', allowNull: true },
    createdAt: { type: DataTypes.DATE, field: 'createdAt' },
    updatedAt: { type: DataTypes.DATE, field: 'updatedAt' },
  },
  { sequelize, modelName: 'UserSettings', tableName: 'user_settings', timestamps: true },
);
