'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mst_language', {
      id:            { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      code:          { type: Sequelize.STRING(8), allowNull: false, unique: true },
      name:          { type: Sequelize.STRING(80), allowNull: false },
      native_name:   { type: Sequelize.STRING(80), allowNull: true },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active:     { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('mst_language');
  },
};
