/**
 * sequelize-cli configuration (migrations + seeders only).
 *
 * The runtime connection lives in `src/db/sequelize.ts`; the CLI cannot read the
 * TypeScript module, so it reads the same env vars here. Keep the two in sync.
 */
require('dotenv').config();

const common = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dialect: 'mysql',
  define: { underscored: true, timestamps: true },
  logging: false,

  // auth-gateway shares the `mindmap_server` schema with the legacy mindmap-api,
  // which already owns the default `SequelizeMeta` table (59 applied migrations).
  // Keeping a separate ledger means neither codebase can undo or re-run the
  // other's migrations.
  migrationStorageTableName: 'SequelizeMetaAuthGateway',
  seederStorage: 'sequelize',
  seederStorageTableName: 'SequelizeDataAuthGateway',
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
