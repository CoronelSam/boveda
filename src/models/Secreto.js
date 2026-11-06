const { Schema, model } = require('mongoose');

const SolicitudSchema = new Schema(
  {
    userId: { type: Number, required: true },
    fecha: { type: Date, required: true },
  },
  { _id: false },
);

const SecretoSchema = new Schema(
  {
    titulo: { type: String, required: true, trim: true },
    // select: false: ninguna consulta lo trae salvo que lo pida con '+contenido'.
    contenido: { type: String, required: true, select: false },
    creadoPor: { type: Number, required: true },
    fechaApertura: { type: Date },
    solicitudes: { type: [SolicitudSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = model('Secreto', SecretoSchema);
