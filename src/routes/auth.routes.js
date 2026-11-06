const { Router } = require('express');
const { registro, login } = require('../controllers/auth.controller');

const router = Router();

router.post('/registro', registro);
router.post('/login', login);

module.exports = router;
