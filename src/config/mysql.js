const { Sequelize } = require('sequelize');
const env = require('./env');

const sequelize = new Sequelize(env.MYSQL_DB, env.MYSQL_USER, env.MYSQL_PASSWORD, {
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  dialect: 'mysql',
  logging: false,
});

module.exports = sequelize;
