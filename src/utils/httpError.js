function httpError(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

module.exports = { httpError };
