# openmrs-proxy module

Thin REST proxy over OpenMRS. Caches where it's safe.

## Endpoints

| Method | Path | BE Story | Status | Notes |
|---|---|---|---|---|
| GET | `/openmrs/getFacilityContacts[?tag=Facility]` | BE-OMRS-03 | Done | Public — mobile Setup pre-login. 5-min in-memory cache + `Cache-Control: 300`. |
| GET | `/openmrs/getFacilityContacts/{id}` | BE-OMRS-04 | Done | Authenticated. |
| GET | `/openmrs/getDoctorsList/{userId}` | BE-OMRS-01 | Stub (501) | Will land Sprint 43 after BE-PAT modules. |
| GET | `/openmrs/getDoctorDocument/{hash}` | BE-OMRS-02 | Stub (501) | Sprint 47 (teleconsult). |

## Why is BE-OMRS-03 public?

The mobile Setup screen (MOB-AUTH-02) shows the facility dropdown **before**
the user has logged in. So this endpoint must be reachable without a Bearer
token. We rely on the OpenMRS admin Basic-auth credentials in `.env` for the
upstream call — clients don't authenticate to us, but we authenticate to OpenMRS.

If you ever need to restrict this (e.g. an internet-facing deploy), add rate
limiting + IP allowlist via nginx.

## Cache strategy

- In-memory map keyed by `tag`. 5-minute TTL.
- HTTP `Cache-Control: public, max-age=300` so CDN / browser can cache too.
- Admin "Publish config" should invalidate (Sprint 50 — wire `_clearFacilityCache()`).
