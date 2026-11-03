require('dotenv').config({ quiet: true });

const REQUERIDAS = [
  'JWT_SECRET',
  'JWT_REVELAR_SECRET',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DB',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MONGO_URI',
];

const faltantes = REQUERIDAS.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}`);
}

for (const nombre of ['JWT_SECRET', 'JWT_REVELAR_SECRET']) {
  if (process.env[nombre].length < 32) {
    throw new Error(`${nombre} debe tener al menos 32 caracteres`);
  }
}

if (process.env.JWT_SECRET === process.env.JWT_REVELAR_SECRET) {
  throw new Error('JWT_SECRET y JWT_REVELAR_SECRET deben ser distintos');
}

module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REVELAR_SECRET: process.env.JWT_REVELAR_SECRET,
  MYSQL_HOST: process.env.MYSQL_HOST,
  MYSQL_PORT: Number(process.env.MYSQL_PORT),
  MYSQL_DB: process.env.MYSQL_DB,
  MYSQL_USER: process.env.MYSQL_USER,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
  MONGO_URI: process.env.MONGO_URI,
};
