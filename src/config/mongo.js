const mongoose = require('mongoose');
const env = require('./env');

async function conectarMongo() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

module.exports = { conectarMongo };
