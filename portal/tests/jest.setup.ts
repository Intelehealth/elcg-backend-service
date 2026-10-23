import { openmrsSequelize } from '@/db/openmrs';

/**
 * The pool is created as soon as any model module is imported, and `/health`
 * opens a real connection. Without this it keeps the Jest worker alive and Jest
 * force-exits with a "failed to exit gracefully" warning.
 */
afterAll(async () => {
  await openmrsSequelize.close();
});
