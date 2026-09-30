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
  /** NOT NULL with no DB default — a first-ever row (new user) must supply it. */
  declare snoozeTill: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserSettings.init(
  {
    userUuid: { type: DataTypes.STRING(100), field: 'user_uuid', primaryKey: true },
    otp: { type: DataTypes.STRING(10), field: 'otp', allowNull: true },
    otpFor: { type: DataTypes.ENUM('U', 'P', 'A'), field: 'otpFor', allowNull: true },
    // `user_settings.snooze_till` is NOT NULL with no default, so an INSERT that
    // omits it fails under strict SQL mode (ER_NO_DEFAULT_FOR_FIELD). Legacy's
    // model defaults it to '' — a user with no row yet (never subscribed to
    // push notifications) could otherwise never be given an OTP.
    snoozeTill: { type: DataTypes.STRING(255), field: 'snooze_till', allowNull: false, defaultValue: '' },
    createdAt: { type: DataTypes.DATE, field: 'createdAt' },
    updatedAt: { type: DataTypes.DATE, field: 'updatedAt' },
  },
  { sequelize, modelName: 'UserSettings', tableName: 'user_settings', timestamps: true },
);
