# pagerduty service — RETIRED 🔴

**Status:** Retired in Phase 1 per Satyadeep architecture review point #11.

## What this used to do

In the legacy backend monorepo, `pagerduty-microservice` integrated with the PagerDuty SaaS to dispatch on-call pages for production incidents.

## Why it's retired

Per Satyadeep's recommendation, incident management moves to **Jira Service Management (JSM)**:

- Lower licensing cost; we already run Jira.
- Tickets carry richer context (logs, screenshots, comment threads) than PagerDuty incidents.
- Better alignment with our existing ticket workflow.

## What replaces it

- **Jira Service Management** for incident tickets.
- For paging escalation (if needed later), evaluate **Opsgenie** (Atlassian-owned) which integrates natively with Jira.

## Migration notes

If the old `pagerduty-microservice` is still referenced anywhere:

1. Replace `POST` calls to it with the relevant **Jira REST API** ticket-creation endpoint.
2. Audit any cron / monitoring webhook still pointing at this service.

## Keep the folder?

Yes — kept as a tombstone so engineers searching the repo know the decision history. **Do not** add code here. Delete the folder only after the legacy backend is fully decommissioned and no production traffic refers to it.

— *Decision date: 2026-06-16 (Sprint 42 kickoff)*
