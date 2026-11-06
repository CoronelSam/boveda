const { Router } = require('express');
const { crear, listar, solicitar, abrir } = require('../controllers/secretos.controller');
const { httpError } = require('../utils/httpError');

const router = Router();

// requireAuth ya se aplica en app.js a todo /secretos.
router.post('/', crear);
router.get('/', listar);
router.post('/:id/solicitar', solicitar);
router.get('/:id/abrir', abrir);

// Express lanza URIError si el :id trae un % mal codificado, antes de llegar al
// controller. Para el contrato es un id inválido: 404, sin repetir su mensaje interno.
router.use((err, req, res, next) => {
  next(err instanceof URIError ? httpError(404, 'Secreto no encontrado') : err);
});

module.exports = router;
