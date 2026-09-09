import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '@/db/sequelize';

/**
 * Generic dropdown values grouped by `category`. Categories used across the app:
 *   - "province" (Koshi, Madhesh, Bagmati, ...)
 *   - "risk_factor" (Prev LSCS, Young Primigravida, ...)
 *   - "iv_fluid" (RL, DNS, NS, ...)
 *   - "oxytocin_dose", "amtsl_med", "outcome", ...
 *
 * `(category, key)` is unique. Mobile reads by category on demand.
 */
export interface MstDropdownValueAttrs {
  id: string;
  category: string;
  key: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
type CreationAttrs = Optional<MstDropdownValueAttrs, 'id' | 'displayOrder' | 'isActive' | 'createdAt' | 'updatedAt'>;

export class MstDropdownValue extends Model<MstDropdownValueAttrs, CreationAttrs> implements MstDropdownValueAttrs {
  declare id: string;
  declare category: string;
  declare key: string;
  declare label: string;
  declare displayOrder: number;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

MstDropdownValue.init(
  {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    category:     { type: DataTypes.STRING(60), allowNull: false },
    key:          { type: DataTypes.STRING(120), allowNull: false },
    label:        { type: DataTypes.STRING(240), allowNull: false },
    displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'display_order' },
    isActive:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  },
  {
    sequelize,
    tableName: 'mst_dropdown_value',
    underscored: true,
    timestamps: true,
    indexes: [
      { name: 'idx_dropdown_category', fields: ['category'] },
      { name: 'uniq_dropdown_cat_key', fields: ['category', 'key'], unique: true },
    ],
  },
);
