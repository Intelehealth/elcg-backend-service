import { DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import type { PersonName } from '@/modules/users/person-name.model';

/** OpenMRS `person` — demographics shared by users and providers. Read-only. */
export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare personId: number;
  declare gender: string | null;
  /** DATEONLY — surfaced by Sequelize as a `YYYY-MM-DD` string. */
  declare birthdate: string | null;
  declare voided: boolean;
  declare uuid: string;

  declare names?: NonAttribute<PersonName[]>;
}

Person.init(
  {
    personId: { type: DataTypes.INTEGER, field: 'person_id', primaryKey: true },
    gender: { type: DataTypes.STRING(50), field: 'gender' },
    birthdate: { type: DataTypes.DATEONLY, field: 'birthdate' },
    voided: { type: DataTypes.BOOLEAN, field: 'voided' },
    uuid: { type: DataTypes.CHAR(38), field: 'uuid' },
  },
  { sequelize: openmrsSequelize, modelName: 'Person', tableName: 'person' },
);
