import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '@/db/sequelize';

/**
 * Supported UI languages. `code` is ISO 639-1 ('en', 'ne', 'hi', ...).
 * Mobile app reads this on setup to build the language picker.
 */
export interface MstLanguageAttrs {
  id: string;
  code: string;
  name: string;
  nativeName: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
type CreationAttrs = Optional<MstLanguageAttrs, 'id' | 'nativeName' | 'displayOrder' | 'isActive' | 'createdAt' | 'updatedAt'>;

export class MstLanguage extends Model<MstLanguageAttrs, CreationAttrs> implements MstLanguageAttrs {
  declare id: string;
  declare code: string;
  declare name: string;
  declare nativeName: string | null;
  declare displayOrder: number;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

MstLanguage.init(
  {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code:         { type: DataTypes.STRING(8), allowNull: false, unique: true },
    name:         { type: DataTypes.STRING(80), allowNull: false },
    nativeName:   { type: DataTypes.STRING(80), allowNull: true, field: 'native_name' },
    displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'display_order' },
    isActive:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  },
  {
    sequelize,
    tableName: 'mst_language',
    underscored: true,
    timestamps: true,
  },
);
