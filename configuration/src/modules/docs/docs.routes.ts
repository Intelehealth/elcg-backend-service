import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { logger } from '@/utils/logger';

const router = Router();

const specPath = path.resolve(__dirname, '..', '..', 'docs', 'openapi.yaml');

let spec: Record<string, unknown>;
try {
  spec = YAML.load(specPath);
} catch (err) {
  logger.error({ err, specPath }, 'Failed to load portal OpenAPI spec — /docs disabled');
  spec = {
    openapi: '3.0.3',
    info: { title: 'eZAZI Portal (spec load failed)', version: 'error' },
    paths: {},
  };
}

router.get('/openapi.json', (_req, res) => res.json(spec));
router.get('/openapi.yaml', (_req, res) => {
  res.type('application/yaml').send(fs.readFileSync(specPath, 'utf8'));
});

router.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(spec, {
    customSiteTitle: 'eZAZI Configuration · API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
    },
  }),
);

export default router;
