/**
 * Model registry. Importing this module registers every Sequelize model on the
 * OpenMRS connection and wires the associations. `app.ts` imports it once so
 * both the server and Supertest-driven tests get a fully initialised ORM.
 *
 * Aliases (`encounters`, `type`, `patient_name`, …) are the exact keys of the
 * legacy portal's visit-list JSON — renaming one is a breaking API change.
 */
import { Visit, VisitAttribute, VisitAttributeType } from '@/modules/openmrs/models/visit.model';
import {
  Encounter,
  EncounterProvider,
  EncounterType,
} from '@/modules/openmrs/models/encounter.model';
import { Concept, ConceptName, Obs } from '@/modules/openmrs/models/obs.model';
import {
  PatientIdentifier,
  Person,
  PersonName,
  Provider,
} from '@/modules/openmrs/models/person.model';

/* ── Visit ──────────────────────────────────────────────────────────────────── */
Visit.hasMany(Encounter, { as: 'encounters', foreignKey: 'visit_id', sourceKey: 'visit_id' });
Visit.hasMany(VisitAttribute, { as: 'attributes', foreignKey: 'visit_id', sourceKey: 'visit_id' });
Visit.hasOne(PatientIdentifier, {
  as: 'patient',
  foreignKey: 'patient_id',
  sourceKey: 'patient_id',
});
Visit.hasOne(Person, { as: 'person', foreignKey: 'person_id', sourceKey: 'patient_id' });
Visit.hasOne(PersonName, { as: 'patient_name', foreignKey: 'person_id', sourceKey: 'patient_id' });
VisitAttribute.hasOne(VisitAttributeType, {
  as: 'attribute_type',
  foreignKey: 'visit_attribute_type_id',
  sourceKey: 'attribute_type_id',
});

/* ── Encounter ──────────────────────────────────────────────────────────────── */
Encounter.hasOne(EncounterType, {
  as: 'type',
  foreignKey: 'encounter_type_id',
  sourceKey: 'encounter_type',
});
Encounter.hasOne(EncounterProvider, {
  as: 'encounter_provider',
  foreignKey: 'encounter_id',
  sourceKey: 'encounter_id',
});
Encounter.hasMany(Obs, { as: 'obs', foreignKey: 'encounter_id', sourceKey: 'encounter_id' });
EncounterProvider.hasOne(Provider, {
  as: 'provider',
  foreignKey: 'provider_id',
  sourceKey: 'provider_id',
});

/* ── Obs / concept ──────────────────────────────────────────────────────────── */
Obs.hasOne(Concept, { as: 'concept', foreignKey: 'concept_id', sourceKey: 'concept_id' });
Concept.hasMany(ConceptName, {
  as: 'concept_name',
  foreignKey: 'concept_id',
  sourceKey: 'concept_id',
});

/* ── Person / provider ──────────────────────────────────────────────────────── */
Provider.hasOne(Person, { as: 'person', foreignKey: 'person_id', sourceKey: 'person_id' });
Person.hasOne(PersonName, { as: 'person_name', foreignKey: 'person_id', sourceKey: 'person_id' });

export {
  Visit,
  VisitAttribute,
  VisitAttributeType,
  Encounter,
  EncounterProvider,
  EncounterType,
  Concept,
  ConceptName,
  Obs,
  PatientIdentifier,
  Person,
  PersonName,
  Provider,
};
