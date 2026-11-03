const express = require('express');
const authRoutes = require('./routes/auth.routes');
const secretosRoutes = require('./routes/secretos.routes');
const { requireAuth } = require('./middlewares/auth');
const { noEncontrado, manejadorErrores } = require('./middlewares/errores');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.use('/auth', authRoutes);
app.use('/secretos', requireAuth, secretosRoutes);

app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
