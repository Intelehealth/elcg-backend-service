import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/** OpenMRS `concept_name` — a concept has one name per locale/type. */
export class ConceptName extends Model<
  InferAttributes<ConceptName>,
  InferCreationAttributes<ConceptName>
> {
  declare concept_name_id: number;
  declare concept_id: number;
  declare name: string;
  declare voided: boolean;
}

ConceptName.init(
  {
    concept_name_id: { type: DataTypes.INTEGER, primaryKey: true },
    concept_id: { type: DataTypes.INTEGER },
    name: { type: DataTypes.STRING(255) },
    voided: { type: DataTypes.BOOLEAN },
  },
  { sequelize: openmrsSequelize, modelName: 'ConceptName', tableName: 'concept_name' },
);

/** OpenMRS `concept` — what an obs measures (cervix dilatation, FHR, …). */
export class Concept extends Model<InferAttributes<Concept>, InferCreationAttributes<Concept>> {
  declare concept_id: number;
  declare uuid: string;

  declare concept_name?: NonAttribute<ConceptName[]>;
}

Concept.init(
  {
    concept_id: { type: DataTypes.INTEGER, primaryKey: true },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Concept', tableName: 'concept' },
);

/**
 * OpenMRS `obs` — one recorded reading. `comments` carries the LCG alert flag
 * ('R' red / 'Y' yellow) the dashboard counts as alerts.
 */
export class Obs extends Model<InferAttributes<Obs>, InferCreationAttributes<Obs>> {
  declare obs_id: number;
  declare encounter_id: number | null;
  declare concept_id: number;
  declare value_text: string | null;
  declare value_numeric: number | null;
  declare comments: string | null;
  declare voided: boolean;
  declare uuid: string;

  declare concept?: NonAttribute<Concept>;
}

Obs.init(
  {
    obs_id: { type: DataTypes.INTEGER, primaryKey: true },
    encounter_id: { type: DataTypes.INTEGER },
    concept_id: { type: DataTypes.INTEGER },
    value_text: { type: DataTypes.TEXT },
    value_numeric: { type: DataTypes.DOUBLE },
    comments: { type: DataTypes.STRING(255) },
    voided: { type: DataTypes.BOOLEAN },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Obs', tableName: 'obs' },
);
