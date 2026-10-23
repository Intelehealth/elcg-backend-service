import { Op, QueryTypes } from 'sequelize';
import { openmrsSequelize } from '@/db/openmrs';
import {
  Concept,
  ConceptName,
  Encounter,
  EncounterProvider,
  EncounterType,
  Obs,
  PatientIdentifier,
  Person,
  PersonName,
  Provider,
  Visit,
  VisitAttribute,
  VisitAttributeType,
} from '@/db/models';
import {
  visitCountBySpecialityQuery,
  visitCountForGeneralPhysicianQuery,
  visitStatusQuery,
} from '@/modules/openmrs/openmrs.queries';
import type {
  VisitAttributePayload,
  VisitCountRow,
  VisitListItem,
  VisitRiskRow,
  VisitStatusRow,
} from '@/modules/openmrs/openmrs.dto';

/** Name of the visit attribute the mobile app writes the LCG risk score into. */
const VISIT_RISK_ATTRIBUTE = 'Visit Risk';

/**
 * Every non-voided visit with its derived status, newest first — optionally
 * narrowed to one facility.
 */
export async function findVisitStatuses(facilityUuid?: string): Promise<VisitStatusRow[]> {
  return openmrsSequelize.query<VisitStatusRow>(visitStatusQuery(Boolean(facilityUuid)), {
    type: QueryTypes.SELECT,
    replacements: facilityUuid ? { facilityUuid } : undefined,
  });
}

/**
 * The "Visit Risk" attribute rows for the given visits, oldest first. Voided rows
 * are included on purpose — legacy did not filter them (see the service).
 */
export async function findVisitRiskAttributes(visitIds: number[]): Promise<VisitRiskRow[]> {
  if (visitIds.length === 0) return [];

  const rows = await VisitAttribute.findAll({
    attributes: ['visit_id', 'value_reference'],
    include: [
      {
        model: VisitAttributeType,
        as: 'attribute_type',
        attributes: [],
        where: { name: VISIT_RISK_ATTRIBUTE },
      },
    ],
    where: { visit_id: { [Op.in]: visitIds } },
    order: [['visit_attribute_id', 'ASC']],
  });
  return rows.map((row) => ({ visit_id: row.visit_id, value_reference: row.value_reference }));
}

/**
 * The full visit tree the dashboard renders — encounters with their obs, type
 * and provider, plus patient identifier, name and demographics — newest first.
 *
 * Visit attributes are fetched separately by `findVisitAttributesByVisit`:
 * joining them here as well would multiply every encounter × obs row by the
 * number of attributes.
 */
export async function findVisitsWithEncounters(
  visitIds: number[],
): Promise<Omit<VisitListItem, 'attributes'>[]> {
  if (visitIds.length === 0) return [];

  const visits = await Visit.findAll({
    attributes: ['visit_id', 'uuid', 'date_stopped', 'date_started', 'voided'],
    include: [
      {
        model: Encounter,
        as: 'encounters',
        attributes: ['encounter_datetime', 'uuid', 'voided'],
        required: false,
        include: [
          {
            model: Obs,
            as: 'obs',
            attributes: ['value_text', 'value_numeric', 'comments', 'uuid', 'voided'],
            required: false,
            include: [
              {
                model: Concept,
                as: 'concept',
                attributes: ['uuid'],
                required: false,
                include: [
                  {
                    model: ConceptName,
                    as: 'concept_name',
                    attributes: ['name', 'voided'],
                    required: false,
                  },
                ],
              },
            ],
          },
          {
            model: EncounterType,
            as: 'type',
            attributes: ['name'],
            required: false,
          },
          {
            model: EncounterProvider,
            as: 'encounter_provider',
            attributes: ['uuid', 'voided'],
            include: [
              {
                model: Provider,
                as: 'provider',
                attributes: ['identifier', 'uuid'],
                include: [
                  {
                    model: Person,
                    as: 'person',
                    attributes: ['gender'],
                    include: [
                      {
                        model: PersonName,
                        as: 'person_name',
                        attributes: ['given_name', 'family_name'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: PatientIdentifier,
        as: 'patient',
        attributes: ['identifier'],
        required: false,
      },
      {
        model: PersonName,
        as: 'patient_name',
        attributes: ['given_name', 'family_name'],
        required: false,
      },
      {
        model: Person,
        as: 'person',
        attributes: ['uuid', 'gender', 'birthdate'],
        required: false,
      },
    ],
    where: { visit_id: { [Op.in]: visitIds } },
    order: [['visit_id', 'DESC']],
  });

  /*
   * `get({ plain: true })` is typed with the model's own columns only; the
   * included associations are there at runtime but invisible to the type.
   */
  return visits.map(
    (visit) => visit.get({ plain: true }) as unknown as Omit<VisitListItem, 'attributes'>,
  );
}

/** Each visit's attributes (with their type), keyed by `visit_id`. */
export async function findVisitAttributesByVisit(
  visitIds: number[],
): Promise<Map<number, VisitAttributePayload[]>> {
  const byVisit = new Map<number, VisitAttributePayload[]>();
  if (visitIds.length === 0) return byVisit;

  const visits = await Visit.findAll({
    attributes: ['visit_id'],
    include: [
      {
        model: VisitAttribute,
        as: 'attributes',
        attributes: ['value_reference', 'uuid', 'voided'],
        include: [
          {
            model: VisitAttributeType,
            as: 'attribute_type',
            attributes: ['name', 'uuid'],
          },
        ],
      },
    ],
    where: { visit_id: { [Op.in]: visitIds } },
  });

  for (const visit of visits) {
    const plain = visit.get({ plain: true }) as {
      visit_id: number;
      attributes?: VisitAttributePayload[];
    };
    byVisit.set(plain.visit_id, plain.attributes ?? []);
  }
  return byVisit;
}

/** Active-visit counts per status for one speciality. */
export async function countVisitsBySpeciality(speciality: string): Promise<VisitCountRow[]> {
  return openmrsSequelize.query<VisitCountRow>(visitCountBySpecialityQuery(), {
    type: QueryTypes.SELECT,
    replacements: { speciality },
  });
}

/** Active-visit counts per status for General Physician (incl. visits with no speciality). */
export async function countVisitsForGeneralPhysician(): Promise<VisitCountRow[]> {
  return openmrsSequelize.query<VisitCountRow>(visitCountForGeneralPhysicianQuery(), {
    type: QueryTypes.SELECT,
  });
}
