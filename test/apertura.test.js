const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluarApertura,
  agentesVigentes,
  VENTANA_MS,
  QUORUM,
} = require('../src/services/apertura');

const AHORA = new Date('2026-11-03T20:00:00.000Z');
const CREADOR = 1;
const A = 2;
const B = 3;
const C = 4;
const JEFE = 5;

function haceMs(ms) {
  return new Date(AHORA.getTime() - ms);
}

function secreto({ solicitudes = [], fechaApertura } = {}) {
  return { creadoPor: CREADOR, fechaApertura, solicitudes };
}

function solicitud(userId, fecha = AHORA) {
  return { userId, fecha };
}

test('la regla es de 2 agentes en 5 minutos', () => {
  assert.equal(QUORUM, 2);
  assert.equal(VENTANA_MS, 300000);
});

test('una solicitud de un agente: cerrado y falta 1', () => {
  const r = evaluarApertura(secreto({ solicitudes: [solicitud(A)] }), A, AHORA);
  assert.deepEqual(r, { abierto: false, vigentes: 1, faltan: 1, esParticipante: true });
});

test('sin solicitudes ni fecha: cerrado y faltan 2', () => {
  const r = evaluarApertura(secreto(), A, AHORA);
  assert.deepEqual(r, { abierto: false, vigentes: 0, faltan: 2, esParticipante: false });
});

test('el mismo agente dos veces sigue contando como uno', () => {
  const r = evaluarApertura(
    secreto({ solicitudes: [solicitud(A), solicitud(A, haceMs(1000))] }),
    A,
    AHORA,
  );
  assert.equal(r.abierto, false);
  assert.equal(r.faltan, 1);
});

test('creador más un agente: cerrado para ambos', () => {
  const s = secreto({ solicitudes: [solicitud(CREADOR), solicitud(A)] });

  const paraAgente = evaluarApertura(s, A, AHORA);
  assert.equal(paraAgente.abierto, false);
  assert.equal(paraAgente.faltan, 1);

  const paraCreador = evaluarApertura(s, CREADOR, AHORA);
  assert.equal(paraCreador.abierto, false);
  assert.equal(paraCreador.esParticipante, false);
});

test('A y B dentro de 5 min: A y B abren; un tercero que no solicitó, no', () => {
  const s = secreto({ solicitudes: [solicitud(A, haceMs(60000)), solicitud(B)] });

  assert.deepEqual(evaluarApertura(s, A, AHORA), { abierto: true, via: 'quorum' });
  assert.deepEqual(evaluarApertura(s, B, AHORA), { abierto: true, via: 'quorum' });
  assert.deepEqual(evaluarApertura(s, C, AHORA), {
    abierto: false,
    vigentes: 2,
    faltan: 0,
    esParticipante: false,
  });
});

test('el creador no abre con el quórum de otros dos agentes', () => {
  const s = secreto({ solicitudes: [solicitud(A), solicitud(B)] });
  const r = evaluarApertura(s, CREADOR, AHORA);
  assert.equal(r.abierto, false);
  assert.equal(r.faltan, 0);
  assert.equal(r.esParticipante, false);
});

test('A solicitó hace 5 min y 1 s, B ahora: cerrado', () => {
  const s = secreto({
    solicitudes: [solicitud(A, haceMs(VENTANA_MS + 1000)), solicitud(B)],
  });
  const paraB = evaluarApertura(s, B, AHORA);
  assert.equal(paraB.abierto, false);
  assert.equal(paraB.vigentes, 1);
  assert.equal(paraB.faltan, 1);

  const paraA = evaluarApertura(s, A, AHORA);
  assert.equal(paraA.abierto, false);
  assert.equal(paraA.esParticipante, false);
});

test('un milisegundo fuera de la ventana ya no cuenta', () => {
  const s = secreto({
    solicitudes: [solicitud(A, haceMs(VENTANA_MS + 1)), solicitud(B)],
  });
  assert.equal(evaluarApertura(s, B, AHORA).abierto, false);
});

test('A y B exactamente en el límite de 5 min: abre', () => {
  const limite = haceMs(VENTANA_MS);
  const s = secreto({ solicitudes: [solicitud(A, limite), solicitud(B, limite)] });
  assert.deepEqual(evaluarApertura(s, A, AHORA), { abierto: true, via: 'quorum' });
});

test('una solicitud con fecha futura no cuenta', () => {
  const futura = new Date(AHORA.getTime() + 1);
  const s = secreto({ solicitudes: [solicitud(A, futura), solicitud(B)] });
  const r = evaluarApertura(s, B, AHORA);
  assert.equal(r.abierto, false);
  assert.equal(r.vigentes, 1);
});

test('fechaApertura pasada y sin solicitudes: abre para cualquiera', () => {
  const s = secreto({ fechaApertura: haceMs(1000) });
  assert.deepEqual(evaluarApertura(s, C, AHORA), { abierto: true, via: 'tiempo' });
  assert.deepEqual(evaluarApertura(s, CREADOR, AHORA), { abierto: true, via: 'tiempo' });
});

test('fechaApertura exactamente igual a la hora del servidor: abre', () => {
  const s = secreto({ fechaApertura: new Date(AHORA) });
  assert.deepEqual(evaluarApertura(s, C, AHORA), { abierto: true, via: 'tiempo' });
});

test('fechaApertura futura: cerrado', () => {
  const s = secreto({ fechaApertura: new Date(AHORA.getTime() + 1) });
  const r = evaluarApertura(s, A, AHORA);
  assert.equal(r.abierto, false);
  assert.equal(r.faltan, 2);
});

test('fechaApertura futura no impide abrir por quórum', () => {
  const s = secreto({
    fechaApertura: new Date(AHORA.getTime() + VENTANA_MS),
    solicitudes: [solicitud(A), solicitud(B)],
  });
  assert.deepEqual(evaluarApertura(s, A, AHORA), { abierto: true, via: 'quorum' });
});

// La función no recibe el rol: el jefe es un id más y no tiene ningún atajo.
test('un jefe solo: cerrado', () => {
  const s = secreto({ solicitudes: [solicitud(JEFE)] });
  const r = evaluarApertura(s, JEFE, AHORA);
  assert.equal(r.abierto, false);
  assert.equal(r.faltan, 1);
});

test('agentesVigentes da el conteo también cuando ya hay quórum', () => {
  const s = secreto({
    solicitudes: [
      solicitud(CREADOR),
      solicitud(A),
      solicitud(B),
      solicitud(C),
      solicitud(JEFE, haceMs(VENTANA_MS + 1)),
    ],
  });
  assert.deepEqual([...agentesVigentes(s, AHORA)], [A, B, C]);
});
