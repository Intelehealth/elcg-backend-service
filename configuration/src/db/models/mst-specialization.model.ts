import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '@/db/sequelize';

/**
 * Doctor / provider specialization (Obstetrics, Gynaecology, etc.). Referenced
 * by patient-registration doctor picker + provider attribute assignment.
 */
export interface MstSpecializationAttrs {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
type CreationAttrs = Optional<MstSpecializationAttrs, 'id' | 'displayOrder' | 'isActive' | 'createdAt' | 'updatedAt'>;

export class MstSpecialization extends Model<MstSpecializationAttrs, CreationAttrs> implements MstSpecializationAttrs {
  declare id: string;
  declare name: string;
  declare displayOrder: number;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

MstSpecialization.init(
  {
    id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name:         { type: DataTypes.STRING(120), allowNull: false, unique: true },
    displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'display_order' },
    isActive:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  },
  {
    sequelize,
    tableName: 'mst_specialization',
    underscored: true,
    timestamps: true,
  },
);
