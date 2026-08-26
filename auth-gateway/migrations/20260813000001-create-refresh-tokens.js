'use strict';

/**
 * Refresh-token store. Lives in `mindmap_server`, NOT in OpenMRS — OpenMRS owns
 * identity, the gateway owns sessions. `user_uuid` therefore carries no foreign
 * key: it references `openmrs.users.uuid` across schemas, which MySQL cannot
 * enforce.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      jti: { type: Sequelize.CHAR(36), allowNull: false, unique: true },
      family_id: { type: Sequelize.CHAR(36), allowNull: false },
      user_uuid: { type: Sequelize.CHAR(38), allowNull: false },
      token_hash: { type: Sequelize.CHAR(64), allowNull: false },
      device_id: { type: Sequelize.STRING(255), allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      revoked_reason: { type: Sequelize.STRING(50), allowNull: true },
      replaced_by_jti: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    // Reuse detection revokes by family; both lookups must stay indexed.
    await queryInterface.addIndex('refresh_tokens', ['family_id'], {
      name: 'idx_refresh_tokens_family_id',
    });
    await queryInterface.addIndex('refresh_tokens', ['user_uuid', 'revoked_at'], {
      name: 'idx_refresh_tokens_user_revoked',
    });
    await queryInterface.addIndex('refresh_tokens', ['expires_at'], {
      name: 'idx_refresh_tokens_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
