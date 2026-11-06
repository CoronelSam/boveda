const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql');

const Usuario = sequelize.define(
  'Usuario',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    password: { type: DataTypes.STRING, allowNull: false },
    rol: { type: DataTypes.ENUM('agente', 'jefe'), allowNull: false, defaultValue: 'agente' },
    // Con milisegundos: la defensa 9.1 compara esta fecha con el createdAt de Mongo. Un DATETIME
    // simple la truncaría al segundo y una cuenta recién creada podría parecer anterior al secreto.
    createdAt: { type: DataTypes.DATE(3), allowNull: false },
  },
  { tableName: 'usuarios', timestamps: true },
);

module.exports = Usuario;
