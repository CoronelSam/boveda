function noEncontrado(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Express reconoce un manejador de errores por sus 4 parámetros.
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Errores de express.json(): no se reenvía el mensaje interno del parser.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }

  // Errores creados con httpError().
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err.stack || err);
  return res.status(500).json({ error: 'Error interno' });
}

module.exports = { noEncontrado, manejadorErrores };
