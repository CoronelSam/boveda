const VENTANA_MS = 5 * 60 * 1000;
const QUORUM = 2;

// Agentes distintos, sin contar al creador, con una solicitud dentro de la ventana.
function agentesVigentes(secreto, ahora) {
  const desde = ahora.getTime() - VENTANA_MS;
  return new Set(
    secreto.solicitudes
      .filter((s) => s.userId !== secreto.creadoPor)
      .filter((s) => s.fecha.getTime() >= desde && s.fecha.getTime() <= ahora.getTime())
      .map((s) => s.userId),
  );
}

function evaluarApertura(secreto, usuarioId, ahora) {
  if (secreto.fechaApertura && ahora.getTime() >= secreto.fechaApertura.getTime()) {
    return { abierto: true, via: 'tiempo' };
  }

  const vigentes = agentesVigentes(secreto, ahora);

  if (vigentes.size >= QUORUM && vigentes.has(usuarioId)) {
    return { abierto: true, via: 'quorum' };
  }

  return {
    abierto: false,
    vigentes: vigentes.size,
    faltan: Math.max(0, QUORUM - vigentes.size),
    esParticipante: vigentes.has(usuarioId),
  };
}

module.exports = { evaluarApertura, agentesVigentes, VENTANA_MS, QUORUM };
