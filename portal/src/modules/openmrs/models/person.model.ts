import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `person_name`. Read through `visit.patient_name` and `person.person_name`. */
export class PersonName extends Model<
  InferAttributes<PersonName>,
  InferCreationAttributes<PersonName>
> {
  declare person_name_id: number;
  declare person_id: number;
  declare given_name: string | null;
  declare family_name: string | null;
}

PersonName.init(
  {
    person_name_id: { type: DataTypes.INTEGER, primaryKey: true },
    person_id: { type: DataTypes.INTEGER },
    given_name: { type: DataTypes.STRING(50) },
    family_name: { type: DataTypes.STRING(50) },
  },
  { sequelize: openmrsSequelize, modelName: 'PersonName', tableName: 'person_name' },
);

/** OpenMRS `person` — demographics shared by patients and providers. */
export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare person_id: number;
  declare gender: string | null;
  /*
   * Declared as DATE (not DATEONLY) on purpose: the legacy portal serialised it
   * as a full ISO timestamp, and clients written against it expect that format.
   */
  declare birthdate: Date | null;
  declare uuid: string;

  declare person_name?: NonAttribute<PersonName>;
}

Person.init(
  {
    person_id: { type: DataTypes.INTEGER, primaryKey: true },
    gender: { type: DataTypes.STRING(50) },
    birthdate: { type: DataTypes.DATE },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Person', tableName: 'person' },
);

/** OpenMRS `patient_identifier` — the patient's OpenMRS ID shown on the dashboard. */
export class PatientIdentifier extends Model<
  InferAttributes<PatientIdentifier>,
  InferCreationAttributes<PatientIdentifier>
> {
  declare patient_identifier_id: number;
  declare patient_id: number;
  declare identifier: string;
}

PatientIdentifier.init(
  {
    patient_identifier_id: { type: DataTypes.INTEGER, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER },
    identifier: { type: DataTypes.STRING(50) },
  },
  {
    sequelize: openmrsSequelize,
    modelName: 'PatientIdentifier',
    tableName: 'patient_identifier',
  },
);

/** OpenMRS `provider` — the health worker behind an encounter. */
export class Provider extends Model<InferAttributes<Provider>, InferCreationAttributes<Provider>> {
  declare provider_id: number;
  declare person_id: number | null;
  declare identifier: string | null;
  declare uuid: string;

  declare person?: NonAttribute<Person>;
}

Provider.init(
  {
    provider_id: { type: DataTypes.INTEGER, primaryKey: true },
    person_id: { type: DataTypes.INTEGER },
    identifier: { type: DataTypes.STRING(255) },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Provider', tableName: 'provider' },
);
