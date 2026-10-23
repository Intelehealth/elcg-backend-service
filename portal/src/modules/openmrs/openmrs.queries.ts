/**
 * Raw SQL for the visit-list and visit-count endpoints, ported from legacy
 * portal's `controllers/queries.js` and `controllers/openMrs.controller.js`.
 *
 * These stay as hand-written SQL rather than Sequelize finders because they
 * aggregate over every visit's latest encounter, which the ORM cannot express
 * without a subquery per row. User input is never interpolated — every value
 * goes through a named `:replacement`, which Sequelize escapes.
 */

/**
 * One row per non-voided visit with its derived dashboard status.
 *
 * A visit is "Completed Visit" once it has a Patient Exit Survey (12) or Visit
 * Complete (14) encounter, or has been ended (`date_stopped` set); every other
 * visit is "Visit In Progress". The labour-stage (100–159) and SOS/emergency
 * branch is kept from legacy for readability even though it resolves to the
 * same status as the fallback.
 *
 * `withFacilityFilter` narrows the result to one facility's visits in SQL — the
 * legacy service fetched every visit and filtered by `location_uuid` in memory.
 */
export function visitStatusQuery(withFacilityFilter: boolean): string {
  return `
    SELECT
      t1.visit_id,
      t1.uuid,
      t1.location_id,
      location.uuid AS location_uuid,
      t1.max_enc,
      encounter.encounter_type,
      encounter_type.name AS encounter_type_name,
      CASE
        WHEN (
          encounter.encounter_type = 14
          OR encounter.encounter_type = 12
          OR t1.com_enc = 1
          OR t1.ended = 1
        ) THEN 'Completed Visit'
        WHEN (
          (encounter.encounter_type BETWEEN 100 AND 159)
          OR (
            encounter_type.name IS NOT NULL
            AND (
              LOWER(encounter_type.name) LIKE '%sos%'
              OR LOWER(encounter_type.name) LIKE '%emergency%'
            )
          )
        ) THEN 'Visit In Progress'
        ELSE 'Visit In Progress'
      END AS Status
    FROM (
      SELECT
        v.visit_id,
        v.patient_id,
        v.uuid,
        v.location_id,
        MAX(e.encounter_id) AS max_enc,
        MAX(CASE WHEN e.encounter_type IN (12, 14) THEN 1 ELSE 0 END) AS com_enc,
        MAX(CASE WHEN v.date_stopped IS NOT NULL THEN 1 ELSE 0 END) AS ended
      FROM visit v
      LEFT JOIN encounter e ON v.visit_id = e.visit_id AND e.voided = 0
      WHERE v.voided = 0
      GROUP BY v.visit_id, v.patient_id, v.location_id
    ) AS t1
    LEFT JOIN encounter ON encounter.encounter_id = t1.max_enc
    LEFT JOIN encounter_type ON encounter.encounter_type = encounter_type.encounter_type_id
    LEFT JOIN location ON location.location_id = t1.location_id
    ${withFacilityFilter ? 'WHERE location.uuid = :facilityUuid' : ''}
    ORDER BY t1.visit_id DESC`;
}

/*
 * The CASE shared by both visit-count queries: buckets each active visit by the
 * type of its latest encounter. Visits whose latest encounter matches none of
 * these land in a NULL bucket, exactly as in legacy.
 */
const VISIT_COUNT_STATUS_CASE = `
  CASE
    WHEN (encounter_type = 14 OR encounter_type = 12 OR com_enc = 1) THEN 'Completed Visit'
    WHEN (encounter_type = 9) THEN 'Visit In Progress'
    WHEN (encounter_type = 15) THEN 'Priority'
    WHEN (encounter_type = 1 OR encounter_type = 6) THEN 'Awaiting Consult'
  END`;

/**
 * Active-visit counts per status for one speciality (visit attribute type 5).
 * Requires the `:speciality` replacement.
 */
export function visitCountBySpecialityQuery(): string {
  return `
    SELECT COUNT(t1.visit_id) AS Total, ${VISIT_COUNT_STATUS_CASE} AS Status
    FROM encounter,
      (
        SELECT
          v.visit_id,
          v.patient_id,
          MAX(CASE WHEN va.attribute_type_id = 5 THEN va.value_reference ELSE NULL END) AS speciality,
          MAX(CASE WHEN va.attribute_type_id = 6 THEN va.value_reference ELSE NULL END) AS state,
          MAX(e.encounter_id) AS max_enc,
          MAX(CASE WHEN e.encounter_type = 14 THEN 1 ELSE 0 END) AS com_enc
        FROM visit v, visit_attribute va, encounter e
        WHERE v.voided = 0
          AND v.date_stopped IS NULL
          AND va.voided = 0
          AND va.attribute_type_id IN (5, 6)
          AND va.visit_id = v.visit_id
          AND e.voided = 0
          AND e.visit_id = v.visit_id
        GROUP BY v.visit_id, v.patient_id
        HAVING MAX(CASE WHEN va.attribute_type_id = 5 THEN va.value_reference ELSE NULL END) = :speciality
      ) AS t1
    WHERE encounter_id = max_enc
    GROUP BY ${VISIT_COUNT_STATUS_CASE}`;
}

/**
 * Active-visit counts per status for General Physician. Unlike the speciality
 * query, a visit with no speciality attribute at all also counts as GP.
 */
export function visitCountForGeneralPhysicianQuery(): string {
  return `
    SELECT COUNT(t1.patient_id) AS Total, ${VISIT_COUNT_STATUS_CASE} AS Status
    FROM encounter,
      (
        SELECT
          v.visit_id,
          v.patient_id,
          MAX(e.encounter_id) AS max_enc,
          MAX(CASE WHEN e.encounter_type IN (12, 14) THEN 1 ELSE 0 END) AS com_enc,
          MAX(CASE WHEN va.attribute_type_id = 5 THEN va.value_reference ELSE NULL END) AS speciality
        FROM visit v
        LEFT JOIN encounter e USING (visit_id)
        LEFT JOIN visit_attribute va USING (visit_id)
        WHERE v.voided = 0
          AND v.date_stopped IS NULL
          AND e.voided = 0
        GROUP BY v.visit_id, v.patient_id
      ) AS t1
    WHERE encounter_id = max_enc
      AND (speciality IS NULL OR speciality = 'General Physician')
    GROUP BY ${VISIT_COUNT_STATUS_CASE}`;
}
