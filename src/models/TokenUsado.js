const { Schema, model } = require('mongoose');

const TokenUsadoSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  expiraEn: { type: Date, required: true, expires: 0 },
}, { versionKey: false });

module.exports = model('TokenUsado', TokenUsadoSchema);
