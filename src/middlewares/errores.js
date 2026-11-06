function noEncontrado(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Express reconoce un manejador de errores por sus 4 parámetros.
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Solo los errores creados con httpError() llevan un mensaje pensado para el cliente.
  if (err.esHttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Errores de express.json(): no se reenvía el mensaje interno del parser.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }

  // Otros 4xx de Express o del parser (charset, compresión, parámetros mal codificados).
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Petición inválida' });
  }

  console.error(err.stack || err);
  return res.status(500).json({ error: 'Error interno' });
}

module.exports = { noEncontrado, manejadorErrores };
