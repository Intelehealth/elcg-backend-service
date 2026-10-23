import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import type { Encounter } from '@/modules/openmrs/models/encounter.model';
import type { PatientIdentifier, Person, PersonName } from '@/modules/openmrs/models/person.model';

/*
 * Naming note for every model under this folder: attributes are declared in
 * OpenMRS's own snake_case column names, not camelCase + `field`. These models
 * back the visit-list endpoints, whose JSON is the raw nested visit tree the
 * legacy portal returned (`visit_id`, `date_started`, `encounters[].obs[]`, …).
 * Keeping the column names as attribute names keeps that contract byte-for-byte
 * without a mapping layer.
 */

/** OpenMRS `visit_attribute_type` — supplies the attribute's name (e.g. "Visit Risk"). */
export class VisitAttributeType extends Model<
  InferAttributes<VisitAttributeType>,
  InferCreationAttributes<VisitAttributeType>
> {
  declare visit_attribute_type_id: number;
  declare name: string;
  declare uuid: string;
}

VisitAttributeType.init(
  {
    visit_attribute_type_id: { type: DataTypes.INTEGER, primaryKey: true },
    name: { type: DataTypes.STRING(255) },
    uuid: { type: DataTypes.CHAR(38) },
  },
  {
    sequelize: openmrsSequelize,
    modelName: 'VisitAttributeType',
    tableName: 'visit_attribute_type',
  },
);

/** OpenMRS `visit_attribute` — free-form key/value pairs hung off a visit. */
export class VisitAttribute extends Model<
  InferAttributes<VisitAttribute>,
  InferCreationAttributes<VisitAttribute>
> {
  declare visit_attribute_id: number;
  declare visit_id: number;
  declare attribute_type_id: number;
  declare value_reference: string | null;
  declare uuid: string;
  declare voided: boolean;

  declare attribute_type?: NonAttribute<VisitAttributeType>;
}

VisitAttribute.init(
  {
    visit_attribute_id: { type: DataTypes.INTEGER, primaryKey: true },
    visit_id: { type: DataTypes.INTEGER },
    attribute_type_id: { type: DataTypes.INTEGER },
    value_reference: { type: DataTypes.TEXT },
    uuid: { type: DataTypes.CHAR(38) },
    voided: { type: DataTypes.BOOLEAN },
  },
  { sequelize: openmrsSequelize, modelName: 'VisitAttribute', tableName: 'visit_attribute' },
);

/** OpenMRS `visit` — one labour case on the dashboard. Read-only. */
export class Visit extends Model<InferAttributes<Visit>, InferCreationAttributes<Visit>> {
  declare visit_id: number;
  declare patient_id: number;
  declare location_id: number | null;
  declare date_started: Date;
  declare date_stopped: Date | null;
  declare voided: boolean;
  declare uuid: string;

  declare encounters?: NonAttribute<Encounter[]>;
  declare attributes?: NonAttribute<VisitAttribute[]>;
  declare patient?: NonAttribute<PatientIdentifier>;
  declare patient_name?: NonAttribute<PersonName>;
  declare person?: NonAttribute<Person>;
}

Visit.init(
  {
    visit_id: { type: DataTypes.INTEGER, primaryKey: true },
    patient_id: { type: DataTypes.INTEGER },
    location_id: { type: DataTypes.INTEGER },
    date_started: { type: DataTypes.DATE },
    date_stopped: { type: DataTypes.DATE },
    voided: { type: DataTypes.BOOLEAN },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Visit', tableName: 'visit' },
);
