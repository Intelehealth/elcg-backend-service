'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mst_dropdown_value', {
      id:            { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      category:      { type: Sequelize.STRING(60), allowNull: false },
      key:           { type: Sequelize.STRING(120), allowNull: false },
      label:         { type: Sequelize.STRING(240), allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active:     { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('mst_dropdown_value', ['category'], { name: 'idx_dropdown_category' });
    await queryInterface.addIndex('mst_dropdown_value', ['category', 'key'], {
      name: 'uniq_dropdown_cat_key',
      unique: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('mst_dropdown_value');
  },
};
