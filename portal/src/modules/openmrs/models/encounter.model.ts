import {
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import type { Obs } from '@/modules/openmrs/models/obs.model';
import type { Provider } from '@/modules/openmrs/models/person.model';

/** OpenMRS `encounter_type` — e.g. ADULTINITIAL, Visit Note, Stage 1 Hour 1 … */
export class EncounterType extends Model<
  InferAttributes<EncounterType>,
  InferCreationAttributes<EncounterType>
> {
  declare encounter_type_id: number;
  declare name: string;
}

EncounterType.init(
  {
    encounter_type_id: { type: DataTypes.INTEGER, primaryKey: true },
    name: { type: DataTypes.STRING(50) },
  },
  { sequelize: openmrsSequelize, modelName: 'EncounterType', tableName: 'encounter_type' },
);

/** OpenMRS `encounter_provider` — links an encounter to the provider who recorded it. */
export class EncounterProvider extends Model<
  InferAttributes<EncounterProvider>,
  InferCreationAttributes<EncounterProvider>
> {
  declare encounter_provider_id: number;
  declare encounter_id: number;
  declare provider_id: number;
  declare voided: boolean;
  declare uuid: string;

  declare provider?: NonAttribute<Provider>;
}

EncounterProvider.init(
  {
    encounter_provider_id: { type: DataTypes.INTEGER, primaryKey: true },
    encounter_id: { type: DataTypes.INTEGER },
    provider_id: { type: DataTypes.INTEGER },
    voided: { type: DataTypes.BOOLEAN },
    uuid: { type: DataTypes.CHAR(38) },
  },
  {
    sequelize: openmrsSequelize,
    modelName: 'EncounterProvider',
    tableName: 'encounter_provider',
  },
);

/**
 * OpenMRS `encounter`. Encounter types the visit-list logic keys on:
 *   1 ADULTINITIAL · 6 Vitals · 9 Visit Note · 12 Patient Exit Survey ·
 *   14 Visit Complete · 15 Flagged · 100–159 labour stage encounters.
 */
export class Encounter extends Model<
  InferAttributes<Encounter>,
  InferCreationAttributes<Encounter>
> {
  declare encounter_id: number;
  declare encounter_type: number;
  declare visit_id: number | null;
  declare encounter_datetime: Date;
  declare voided: boolean;
  declare uuid: string;

  declare type?: NonAttribute<EncounterType>;
  declare encounter_provider?: NonAttribute<EncounterProvider>;
  declare obs?: NonAttribute<Obs[]>;
}

Encounter.init(
  {
    encounter_id: { type: DataTypes.INTEGER, primaryKey: true },
    encounter_type: { type: DataTypes.INTEGER },
    visit_id: { type: DataTypes.INTEGER },
    encounter_datetime: { type: DataTypes.DATE },
    voided: { type: DataTypes.BOOLEAN },
    uuid: { type: DataTypes.CHAR(38) },
  },
  { sequelize: openmrsSequelize, modelName: 'Encounter', tableName: 'encounter' },
);
