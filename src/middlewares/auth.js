const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { httpError } = require('../utils/httpError');

const FORMATO_BEARER = /^Bearer (\S+)$/;

function verificarToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const coincidencia = FORMATO_BEARER.exec(req.headers.authorization ?? '');
  const payload = coincidencia ? verificarToken(coincidencia[1]) : null;

  // Los payloads con `tipo` son tokens del bonus, no de sesión.
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !Number.isInteger(payload.id) ||
    typeof payload.rol !== 'string' ||
    'tipo' in payload
  ) {
    return next(httpError(401, 'No autorizado'));
  }

  req.usuario = { id: payload.id, rol: payload.rol };
  next();
}

module.exports = { requireAuth };
