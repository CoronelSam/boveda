const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UniqueConstraintError, ValidationError } = require('sequelize');
const env = require('../config/env');
const Usuario = require('../models/Usuario');
const { httpError } = require('../utils/httpError');

const COSTO_BCRYPT = 10;
const MAX_CARACTERES = 255;
const MIN_CARACTERES_PASSWORD = 8;
// bcrypt ignora lo que pase de 72 bytes.
const MAX_BYTES_PASSWORD = 72;

// Hash de un valor aleatorio que no se guarda: en el login se compara contra él cuando el email
// no existe, para que ese caso tarde lo mismo que un password incorrecto.
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), COSTO_BCRYPT);

function normalizarEmail(email) {
  return email.trim().toLowerCase();
}

function excedeBytesPassword(password) {
  return Buffer.byteLength(password, 'utf8') > MAX_BYTES_PASSWORD;
}

async function registro(req, res) {
  const { nombre, email, password } = req.body ?? {};

  if (typeof nombre !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'nombre, email y password son requeridos y deben ser texto');
  }

  const nombreLimpio = nombre.trim();
  const emailLimpio = normalizarEmail(email);

  if (nombreLimpio === '') {
    throw httpError(400, 'El nombre no puede estar vacío');
  }
  if (nombreLimpio.length > MAX_CARACTERES || emailLimpio.length > MAX_CARACTERES) {
    throw httpError(400, `nombre y email no pueden pasar de ${MAX_CARACTERES} caracteres`);
  }
  if (password.length < MIN_CARACTERES_PASSWORD) {
    throw httpError(400, `El password debe tener al menos ${MIN_CARACTERES_PASSWORD} caracteres`);
  }
  if (excedeBytesPassword(password)) {
    throw httpError(400, `El password no puede pasar de ${MAX_BYTES_PASSWORD} bytes`);
  }

  const hash = await bcrypt.hash(password, COSTO_BCRYPT);

  let usuario;
  try {
    usuario = await Usuario.create({ nombre: nombreLimpio, email: emailLimpio, password: hash });
  } catch (err) {
    // UniqueConstraintError hereda de ValidationError: debe revisarse primero.
    if (err instanceof UniqueConstraintError) {
      throw httpError(409, 'El email ya está registrado');
    }
    if (err instanceof ValidationError) {
      throw httpError(400, 'Datos inválidos: revisa que el email tenga un formato válido');
    }
    throw err;
  }

  res.status(201).json({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
  });
}

async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'email y password son requeridos y deben ser texto');
  }

  const usuario = await Usuario.findOne({
    where: { email: normalizarEmail(email) },
    attributes: ['id', 'rol', 'password'],
  });

  const coincide = await bcrypt.compare(password, usuario ? usuario.password : HASH_FICTICIO);

  // Sin el chequeo de bytes, un password de 72 bytes también aceptaría ese mismo texto con
  // cualquier cosa añadida al final, porque bcrypt solo compara los primeros 72.
  if (!usuario || !coincide || excedeBytesPassword(password)) {
    throw httpError(401, 'Credenciales inválidas');
  }

  const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, env.JWT_SECRET, {
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  res.json({ token });
}

module.exports = { registro, login };
