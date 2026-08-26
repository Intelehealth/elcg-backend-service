import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '@/db/sequelize';

/**
 * One row per issued refresh token (EZ-942).
 *
 * Rotation model: every refresh swaps the presented token for a new one and marks
 * the old row revoked, linking it forward via `replacedByJti`. All tokens descended
 * from a single login share a `familyId`, so presenting an already-rotated token
 * (i.e. a stolen copy) lets us revoke the entire family in one statement.
 *
 * Only the SHA-256 of the token is stored — a DB leak must not yield usable tokens.
 */
export class RefreshToken extends Model<
  InferAttributes<RefreshToken>,
  InferCreationAttributes<RefreshToken>
> {
  declare id: CreationOptional<number>;
  declare jti: string;
  declare familyId: string;
  declare userUuid: string;
  declare tokenHash: string;
  declare deviceId: string | null;
  declare userAgent: string | null;
  declare ipAddress: string | null;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare revokedReason: string | null;
  declare replacedByJti: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

RefreshToken.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    jti: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    familyId: { type: DataTypes.CHAR(36), allowNull: false },
    userUuid: { type: DataTypes.CHAR(38), allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false },
    deviceId: { type: DataTypes.STRING(255), allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    revokedReason: { type: DataTypes.STRING(50), allowNull: true },
    replacedByJti: { type: DataTypes.CHAR(36), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'RefreshToken', tableName: 'refresh_tokens' },
);
