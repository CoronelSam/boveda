const mongoose = require('mongoose');
const Secreto = require('../models/Secreto');
const {
  evaluarApertura,
  agentesVigentes,
  VENTANA_MS,
  QUORUM,
} = require('../services/apertura');
const { httpError } = require('../utils/httpError');

const TITULO_MAX = 200;
const CONTENIDO_MAX = 5000;

// Lo único que necesita la regla de apertura. Nunca incluye contenido.
const CAMPOS_REGLA = 'creadoPor fechaApertura solicitudes';

// Date.parse por sí solo acepta formatos como "March 7"; aquí se exige ISO 8601.
const FECHA_ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function validarTexto(valor, campo, maximo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw httpError(400, `El campo ${campo} debe ser un texto no vacío`);
  }
  if (valor.trim().length > maximo) {
    throw httpError(400, `El campo ${campo} admite hasta ${maximo} caracteres`);
  }
}

function leerFechaApertura(valor) {
  if (valor === undefined) {
    return undefined;
  }

  const partes = typeof valor === 'string' ? FECHA_ISO.exec(valor) : null;
  if (!partes) {
    throw httpError(400, 'El campo fechaApertura debe ser una fecha ISO válida');
  }

  const fecha = new Date(valor);
  const [anio, mes, dia] = partes.slice(1).map(Number);
  // Date convierte "2026-02-31" en 3 de marzo en lugar de rechazarla.
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (Number.isNaN(fecha.getTime()) || dia > diasDelMes) {
    throw httpError(400, 'El campo fechaApertura debe ser una fecha ISO válida');
  }
  return fecha;
}

// Un id mal formado se trata igual que uno inexistente, sin llegar a Mongo.
async function buscarSecreto(id, campos) {
  const secreto = mongoose.isValidObjectId(id)
    ? await Secreto.findById(id).select(campos).lean()
    : null;
  if (!secreto) {
    throw httpError(404, 'Secreto no encontrado');
  }
  return secreto;
}

function explicarCierre(vigentes) {
  const minutos = VENTANA_MS / 60000;
  const hay = vigentes === 1 ? 'Hay 1 vigente' : `Hay ${vigentes} vigentes`;
  return (
    `Se necesitan solicitudes de ${QUORUM} agentes distintos (sin contar al creador) ` +
    `en los últimos ${minutos} minutos, y tú debes ser uno de ellos. ${hay}.`
  );
}

async function crear(req, res) {
  const { titulo, contenido, fechaApertura } = req.body ?? {};

  validarTexto(titulo, 'titulo', TITULO_MAX);
  validarTexto(contenido, 'contenido', CONTENIDO_MAX);
  const fecha = leerFechaApertura(fechaApertura);

  const secreto = await Secreto.create({
    titulo,
    contenido,
    creadoPor: req.usuario.id,
    fechaApertura: fecha,
  });

  res.status(201).json({
    id: secreto.id,
    titulo: secreto.titulo,
    fechaApertura: secreto.fechaApertura ?? null,
    creadoPor: secreto.creadoPor,
  });
}

async function listar(req, res) {
  const secretos = await Secreto.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $project: {
        titulo: 1,
        fechaApertura: 1,
        numSolicitudes: { $size: '$solicitudes' },
      },
    },
  ]);

  res.json(
    secretos.map((s) => ({
      id: String(s._id),
      titulo: s.titulo,
      fechaApertura: s.fechaApertura ?? null,
      numSolicitudes: s.numSolicitudes,
    })),
  );
}

async function solicitar(req, res) {
  const { id } = req.params;
  const uid = req.usuario.id;

  const secreto = await buscarSecreto(id, 'creadoPor');
  if (secreto.creadoPor === uid) {
    throw httpError(403, 'El creador no cuenta para el quórum');
  }

  // Dos pasos atómicos: en paralelo, el filtro $ne impide duplicar al agente.
  const ahora = new Date();
  const renovada = await Secreto.updateOne(
    { _id: id, 'solicitudes.userId': uid },
    { $set: { 'solicitudes.$.fecha': ahora } },
  );
  if (renovada.matchedCount === 0) {
    await Secreto.updateOne(
      { _id: id, 'solicitudes.userId': { $ne: uid } },
      { $push: { solicitudes: { userId: uid, fecha: ahora } } },
    );
  }

  // Se relee para contar también lo que dejaron las peticiones en paralelo.
  const actualizado = await buscarSecreto(id, CAMPOS_REGLA);
  const vigentes = agentesVigentes(actualizado, new Date()).size;

  res.json({
    mensaje: 'Solicitud registrada',
    solicitudesVigentes: vigentes,
    faltan: Math.max(0, QUORUM - vigentes),
  });
}

async function abrir(req, res) {
  const { id } = req.params;

  const secreto = await buscarSecreto(id, CAMPOS_REGLA);
  const resultado = evaluarApertura(secreto, req.usuario.id, new Date());

  if (!resultado.abierto) {
    return res.status(403).json({
      error: 'El secreto sigue cerrado',
      faltan: resultado.faltan,
      detalle: explicarCierre(resultado.vigentes),
      fechaApertura: secreto.fechaApertura ?? null,
    });
  }

  const { contenido } = await buscarSecreto(id, '+contenido');
  res.json({ contenido });
}

module.exports = { crear, listar, solicitar, abrir };
