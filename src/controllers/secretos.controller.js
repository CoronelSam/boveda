const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Op } = require('sequelize');
const env = require('../config/env');
const Usuario = require('../models/Usuario');
const TokenUsado = require('../models/TokenUsado');
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
const CAMPOS_REGLA = 'creadoPor fechaApertura solicitudes createdAt';

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

// Una cuenta registrada después de la creación del secreto no puede formar quórum.
// Se obtiene la elegibilidad de MySQL, no de campos enviados por el cliente.
async function obtenerElegibles(secreto, ahora) {
  const vigentes = agentesVigentes(secreto, ahora);
  if (vigentes.size === 0) return new Set();
  const usuarios = await Usuario.findAll({
    attributes: ['id'],
    where: {
      id: { [Op.in]: [...vigentes] },
      createdAt: { [Op.lt]: secreto.createdAt },
    },
  });
  return new Set(usuarios.map((usuario) => usuario.id));
}

function explicarCierre(vigentes) {
  const minutos = VENTANA_MS / 60000;
  const hay = vigentes === 1 ? 'Hay 1 vigente' : `Hay ${vigentes} vigentes`;
  return (
    `Se necesitan solicitudes de ${QUORUM} agentes distintos (sin contar al creador ni a cuentas ` +
    `creadas después del secreto) en los últimos ${minutos} minutos, y tú debes ser uno de ellos. ${hay}.`
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
  const momento = new Date();
  const elegibles = await obtenerElegibles(actualizado, momento);
  const vigentes = agentesVigentes(actualizado, momento, elegibles).size;

  res.json({
    mensaje: 'Solicitud registrada',
    solicitudesVigentes: vigentes,
    faltan: Math.max(0, QUORUM - vigentes),
  });
}

async function abrir(req, res) {
  const { id } = req.params;

  const secreto = await buscarSecreto(id, CAMPOS_REGLA);
  const ahora = new Date();
  const elegibles = await obtenerElegibles(secreto, ahora);
  const resultado = evaluarApertura(secreto, req.usuario.id, ahora, elegibles);

  if (!resultado.abierto) {
    return res.status(403).json({
      error: 'El secreto sigue cerrado',
      faltan: resultado.faltan,
      detalle: explicarCierre(resultado.vigentes),
      fechaApertura: secreto.fechaApertura ?? null,
    });
  }

  // No se carga ni se devuelve contenido en /abrir.
  const tokenRevelar = jwt.sign(
    { tipo: 'revelar', sid: String(secreto._id), uid: req.usuario.id },
    env.JWT_REVELAR_SECRET,
    { expiresIn: '60s', algorithm: 'HS256', jwtid: crypto.randomUUID() },
  );
  res.json({ tokenRevelar, expiraEn: 60 });
}

async function revelar(req, res) {
  const { id } = req.params;
  // Incluso con un token, un identificador inválido nunca llega a Mongo.
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Secreto no encontrado');

  const token = req.get('X-Token-Revelar');
  let payload;
  try {
    if (typeof token !== 'string' || token.length === 0) throw new Error('Falta token');
    payload = jwt.verify(token, env.JWT_REVELAR_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw httpError(401, 'Token de revelación inválido o expirado');
  }

  if (
    payload.tipo !== 'revelar' ||
    payload.sid !== id ||
    payload.uid !== req.usuario.id ||
    typeof payload.jti !== 'string' ||
    payload.jti.length === 0 ||
    typeof payload.exp !== 'number'
  ) {
    throw httpError(401, 'Token de revelación inválido o expirado');
  }

  // Comprobar existencia antes de consumir el token (el contenido sigue protegido).
  const secreto = await buscarSecreto(id, '+contenido');
  try {
    await TokenUsado.create({ jti: payload.jti, expiraEn: new Date(payload.exp * 1000) });
  } catch (err) {
    if (err.code === 11000) throw httpError(403, 'Token ya utilizado');
    throw err;
  }
  res.json({ contenido: secreto.contenido });
}

module.exports = { crear, listar, solicitar, abrir, revelar, obtenerElegibles };
