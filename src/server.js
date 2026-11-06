const env = require('./config/env');
// Al importar app se cargan rutas → controllers → modelos, así sync() ya los conoce.
const app = require('./app');
const sequelize = require('./config/mysql');
const { conectarMongo } = require('./config/mongo');
const TokenUsado = require('./models/TokenUsado');

async function iniciar() {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('MySQL conectado');

  const conexion = await conectarMongo();
  await TokenUsado.init(); // Garantiza índice único de jti antes de escuchar peticiones.
  console.log(`MongoDB conectado (base: ${conexion.name})`);

  app.listen(env.PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error('No se pudo abrir el puerto:', err.message);
      process.exit(1);
    }
    console.log(`La Bóveda escuchando en http://localhost:${env.PORT}`);
  });
}

iniciar().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err.message);
  process.exit(1);
});
