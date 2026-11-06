function httpError(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  error.esHttpError = true;
  return error;
}

module.exports = { httpError };
