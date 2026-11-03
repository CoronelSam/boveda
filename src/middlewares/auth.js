const { httpError } = require('../utils/httpError');

// Provisional (fase 0): rechaza todo hasta que el agente de Auth implemente
// la verificación del JWT y deje req.usuario = { id, rol }.
function requireAuth(req, res, next) {
  next(httpError(401, 'Autenticación no implementada'));
}

module.exports = { requireAuth };
