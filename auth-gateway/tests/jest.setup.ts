import { sequelize } from '@/db/sequelize';
import { openmrsSequelize } from '@/db/openmrs';

/**
 * Both pools are created as soon as any model module is imported, and `/health`
 * opens a real connection. Without this they keep the Jest worker alive and Jest
 * force-exits with a "failed to exit gracefully" warning.
 */
afterAll(async () => {
  await Promise.all([sequelize.close(), openmrsSequelize.close()]);
});
