import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `person_name`. A person may have several; `preferred` picks the display one. */
export class PersonName extends Model<
  InferAttributes<PersonName>,
  InferCreationAttributes<PersonName>
> {
  declare personNameId: number;
  declare personId: number;
  declare preferred: boolean;
  declare givenName: string | null;
  declare middleName: string | null;
  declare familyName: string | null;
  declare voided: boolean;

  /** `given middle family`, collapsed — mirrors OpenMRS' `person.display`. */
  get display(): NonAttribute<string> {
    return [this.givenName, this.middleName, this.familyName]
      .filter((part) => part && part.trim().length > 0)
      .join(' ');
  }
}

PersonName.init(
  {
    personNameId: { type: DataTypes.INTEGER, field: 'person_name_id', primaryKey: true },
    personId: { type: DataTypes.INTEGER, field: 'person_id' },
    preferred: { type: DataTypes.BOOLEAN, field: 'preferred' },
    givenName: { type: DataTypes.STRING(50), field: 'given_name' },
    middleName: { type: DataTypes.STRING(50), field: 'middle_name' },
    familyName: { type: DataTypes.STRING(50), field: 'family_name' },
    voided: { type: DataTypes.BOOLEAN, field: 'voided' },
  },
  { sequelize: openmrsSequelize, modelName: 'PersonName', tableName: 'person_name' },
);
