// AgentCredit AI

const express = require('express');
const app = express();

app.use(express.json());

const apiV1 = express.Router();
const apiV2 = express.Router();

const ACTORES_VALIDOS = ['cliente', 'agente', 'analista'];
const ESTADOS_SOLICITUD = ['borrador', 'enviada', 'en analisis', 'en revision', 'info requerida', 'aprobada', 'rechazada'];

const TRANSICIONES_VALIDAS = {
	'borrador': ['enviada'],
	'enviada': ['en analisis'],
	'en analisis': ['en revision', 'rechazada'],
	'en revision': ['aprobada', 'rechazada', 'info requerida'],
	'info requerida': ['en analisis'],
	'aprobada': [],
	'rechazada': []
};

const ACTORES_TRANSICION = {
	'borrador->enviada': ['cliente'],
	'enviada->en analisis': ['agente'],
	'en analisis->en revision': ['agente'],
	'en analisis->rechazada': ['agente'],
	'en revision->aprobada': ['analista'],
	'en revision->rechazada': ['analista'],
	'en revision->info requerida': ['analista'],
	'info requerida->en analisis': ['agente']
};

const normalizar = (texto) =>
	String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const esNumero = (valor) => Number.isFinite(+valor);

let clientes = [];
let solicitudes = [];
let analisis = [];
let revisiones = [];
let auditoria = [];
let creditos = [];

let siguienteIdCliente = 1;
let siguienteIdSolicitud = 1;
let siguienteIdAnalisis = 1;
let siguienteIdRevision = 1;
let siguienteIdAuditoria = 1;
let siguienteIdCredito = 1;
let siguienteIdPago = 1;
let siguienteIdDocumento = 1;

const registrarAuditoria = ({ solicitudId, actor, accion, fromEstado = null, toEstado = null, detalle = '' }) => {
	const entrada = {
		id: siguienteIdAuditoria++,
		solicitudId,
		actor,
		accion,
		fromEstado,
		toEstado,
		detalle,
		fecha: new Date()
	};
	auditoria.push(entrada);
	return entrada;
};

const obtenerActor = (req) => normalizar(req.query.actor || '');

const exigirActor = (req, res, permitidos = ACTORES_VALIDOS) => {
	const actor = obtenerActor(req);
	if (!actor) {
		res.status(400).json({ error: 'Debe indicar actor=cliente|agente|analista' });
		return null;
	}
	if (!ACTORES_VALIDOS.includes(actor)) {
		res.status(400).json({ error: `Actor invalido. Use: ${ACTORES_VALIDOS.join(', ')}` });
		return null;
	}
	if (permitidos.length && !permitidos.includes(actor)) {
		res.status(403).json({ error: `El actor '${actor}' no esta autorizado para esta accion` });
		return null;
	}
	return actor;
};

const cambiarEstado = (solicitud, toEstado, actor, detalle = '') => {
	const fromEstado = solicitud.estado;

	if (!ESTADOS_SOLICITUD.includes(toEstado)) {
		return { ok: false, status: 400, error: `Estado invalido. Use: ${ESTADOS_SOLICITUD.join(', ')}` };
	}

	const permitidos = TRANSICIONES_VALIDAS[fromEstado] || [];
	if (!permitidos.includes(toEstado)) {
		return {
			ok: false,
			status: 400,
			error: `Transicion invalida: de '${fromEstado}' a '${toEstado}' no esta permitida`
		};
	}

	const clave = `${fromEstado}->${toEstado}`;
	const actoresPermitidos = ACTORES_TRANSICION[clave];
	if (actoresPermitidos && !actoresPermitidos.includes(actor)) {
		return {
			ok: false,
			status: 403,
			error: `El actor '${actor}' no puede cambiar de '${fromEstado}' a '${toEstado}'`
		};
	}

	solicitud.estado = toEstado;
	solicitud.actualizadoEn = new Date();

	registrarAuditoria({
		solicitudId: solicitud.id,
		actor,
		accion: 'cambio-estado',
		fromEstado,
		toEstado,
		detalle
	});

	return { ok: true };
};

const obtenerClientePorId = (id) => clientes.find(c => c.id === +id);

const crearAnalisis = (solicitud, cliente) => {
	const ingresos = esNumero(cliente.ingresosMensuales) ? +cliente.ingresosMensuales : 0;
	const monto = esNumero(solicitud.monto) ? +solicitud.monto : 0;
	const plazo = esNumero(solicitud.plazoMeses) ? +solicitud.plazoMeses : 0;

	const scoreBruto = 60 + (ingresos / 1000) * 10 - (monto / 1000) * 6 - (plazo / 12) * 4;
	const score = Math.max(0, Math.min(100, Math.round(scoreBruto)));

	const variables = [
		{ nombre: 'ingresosMensuales', valor: ingresos, peso: 0.45 },
		{ nombre: 'montoSolicitado', valor: monto, peso: -0.35 },
		{ nombre: 'plazoMeses', valor: plazo, peso: -0.2 }
	];

	const recomendacion = score >= 70 ? 'aprobar' : (score >= 50 ? 'revisar' : 'rechazar');
	const confianza = Math.max(0.4, Math.min(0.95, score / 100));

	const version = analisis.filter(a => a.solicitudId === solicitud.id).length + 1;

	return {
		id: siguienteIdAnalisis++,
		solicitudId: solicitud.id,
		version,
		score,
		variables,
		recomendacion,
		confianza,
		modeloVersion: 'v1.0',
		creadoEn: new Date()
	};
};

const ejecutarAnalisis = (solicitud, { simularTimeout = false } = {}) => {
	const inicio = cambiarEstado(solicitud, 'en analisis', 'agente', 'inicio analisis automatico');
	if (!inicio.ok) return inicio;

	if (simularTimeout) {
		return { ok: false, status: 504, error: 'Timeout del agente durante el analisis' };
	}

	const cliente = obtenerClientePorId(solicitud.clienteId);
	if (!cliente) {
		return { ok: false, status: 404, error: 'Cliente no encontrado para el analisis' };
	}

	const nuevoAnalisis = crearAnalisis(solicitud, cliente);
	analisis.push(nuevoAnalisis);

	solicitud.scoreRiesgo = nuevoAnalisis.score;
	solicitud.analisisVersionActual = nuevoAnalisis.version;

	const fin = cambiarEstado(solicitud, 'en revision', 'agente', 'analisis completado');
	if (!fin.ok) return fin;

	return { ok: true, analisis: nuevoAnalisis };
};

const crearCreditoDesdeSolicitud = (solicitud) => {
	const existente = creditos.find(c => c.solicitudId === solicitud.id);
	if (existente) return existente;

	const credito = {
		id: siguienteIdCredito++,
		solicitudId: solicitud.id,
		clienteId: solicitud.clienteId,
		montoOriginal: +solicitud.monto,
		saldo: +solicitud.monto,
		plazoMeses: +solicitud.plazoMeses,
		tasa: 0.18,
		estado: 'activo',
		estadoMora: 'al dia',
		pagos: [],
		creadoEn: new Date()
	};

	creditos.push(credito);
	return credito;
};

clientes.push(
	{
		id: siguienteIdCliente++,
		nombre: 'Ana Lopez',
		documentoId: '01020304-5',
		email: 'ana@correo.com',
		telefono: '7000-0001',
		ingresosMensuales: 1200,
		documentos: []
	},
	{
		id: siguienteIdCliente++,
		nombre: 'Carlos Perez',
		documentoId: '05060708-9',
		email: 'carlos@correo.com',
		telefono: '7000-0002',
		ingresosMensuales: 900,
		documentos: []
	}
);

apiV1.get('/clientes', (req, res) => {
	const { q, nombre, documento, email } = req.query;
	let resultados = clientes.slice();

	if (q) {
		const qn = normalizar(q);
		resultados = resultados.filter(c =>
			normalizar(c.nombre).includes(qn) ||
			normalizar(c.documentoId).includes(qn) ||
			normalizar(c.email).includes(qn)
		);
	}

	if (nombre) resultados = resultados.filter(c => normalizar(c.nombre).includes(normalizar(nombre)));
	if (documento) resultados = resultados.filter(c => normalizar(c.documentoId).includes(normalizar(documento)));
	if (email) resultados = resultados.filter(c => normalizar(c.email).includes(normalizar(email)));

	res.json(resultados);
});

apiV1.get('/clientes/:id', (req, res) => {
	const cliente = obtenerClientePorId(req.params.id);
	if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
	res.json(cliente);
});

apiV1.post('/clientes', (req, res) => {
	const { nombre, documentoId, email = '', telefono = '', ingresosMensuales = 0 } = req.body;

	if (!nombre || !documentoId)
		return res.status(400).json({ error: 'Los campos nombre y documentoId son obligatorios' });

	if (clientes.some(c => normalizar(c.documentoId) === normalizar(documentoId)))
		return res.status(400).json({ error: 'Ya existe un cliente con ese documentoId' });

	const cliente = {
		id: siguienteIdCliente++,
		nombre: nombre.trim(),
		documentoId: documentoId.trim(),
		email: String(email || '').trim(),
		telefono: String(telefono || '').trim(),
		ingresosMensuales: esNumero(ingresosMensuales) ? +ingresosMensuales : 0,
		documentos: []
	};

	clientes.push(cliente);
	res.status(201).json(cliente);
});

apiV1.put('/clientes/:id', (req, res) => {
	const id = +req.params.id;
	const indice = clientes.findIndex(c => c.id === id);
	if (indice === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

	if (req.body.documentoId && clientes.some(c => c.id !== id && normalizar(c.documentoId) === normalizar(req.body.documentoId)))
		return res.status(400).json({ error: 'Ya existe otro cliente con ese documentoId' });

	const actualizado = { ...clientes[indice], ...req.body, id };
	if (actualizado.ingresosMensuales !== undefined && !esNumero(actualizado.ingresosMensuales))
		return res.status(400).json({ error: 'ingresosMensuales debe ser numerico' });

	actualizado.ingresosMensuales = esNumero(actualizado.ingresosMensuales) ? +actualizado.ingresosMensuales : 0;
	clientes[indice] = actualizado;
	res.json(actualizado);
});

apiV1.delete('/clientes/:id', (req, res) => {
	const indice = clientes.findIndex(c => c.id === +req.params.id);
	if (indice === -1) return res.status(404).json({ error: 'Cliente no encontrado' });
	const [eliminado] = clientes.splice(indice, 1);
	res.json(eliminado);
});

apiV1.get('/clientes/:id/documentos', (req, res) => {
	const cliente = obtenerClientePorId(req.params.id);
	if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
	res.json(cliente.documentos || []);
});

apiV1.post('/clientes/:id/documentos', (req, res) => {
	const cliente = obtenerClientePorId(req.params.id);
	if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

	const { tipo, nombreArchivo, url, fechaEmision = null, montoDocumento = null } = req.body;
	if (!tipo || !nombreArchivo || !url)
		return res.status(400).json({ error: 'Los campos tipo, nombreArchivo y url son obligatorios' });

	const documento = {
		id: siguienteIdDocumento++,
		tipo,
		nombreArchivo,
		url,
		fechaEmision: fechaEmision ? new Date(fechaEmision) : null,
		montoDocumento: montoDocumento !== null && esNumero(montoDocumento) ? +montoDocumento : null,
		registradoEn: new Date()
	};

	cliente.documentos.push(documento);
	res.status(201).json(documento);
});

apiV1.get('/solicitudes', (req, res) => {
	const { q, estado, clienteId, minMonto, maxMonto, minScore, maxScore, desde, hasta } = req.query;
	let resultados = solicitudes.slice();

	if (estado) resultados = resultados.filter(s => normalizar(s.estado) === normalizar(estado));
	if (clienteId) resultados = resultados.filter(s => s.clienteId === +clienteId);
	if (minMonto && esNumero(minMonto)) resultados = resultados.filter(s => +s.monto >= +minMonto);
	if (maxMonto && esNumero(maxMonto)) resultados = resultados.filter(s => +s.monto <= +maxMonto);
	if (minScore && esNumero(minScore)) resultados = resultados.filter(s => esNumero(s.scoreRiesgo) && +s.scoreRiesgo >= +minScore);
	if (maxScore && esNumero(maxScore)) resultados = resultados.filter(s => esNumero(s.scoreRiesgo) && +s.scoreRiesgo <= +maxScore);

	if (desde) {
		const f = new Date(desde);
		if (!isNaN(f.getTime())) resultados = resultados.filter(s => new Date(s.creadoEn) >= f);
	}

	if (hasta) {
		const f = new Date(hasta);
		if (!isNaN(f.getTime())) resultados = resultados.filter(s => new Date(s.creadoEn) <= f);
	}

	if (q) {
		const qn = normalizar(q);
		resultados = resultados.filter(s => {
			const cliente = obtenerClientePorId(s.clienteId);
			return normalizar(s.proposito).includes(qn) || (cliente && normalizar(cliente.nombre).includes(qn));
		});
	}

	res.json(resultados);
});

apiV1.get('/solicitudes/:id', (req, res) => {
	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
	res.json(solicitud);
});

apiV1.post('/solicitudes', (req, res) => {
	const { clienteId, monto, plazoMeses, proposito } = req.body;

	if (!clienteId || monto == null || plazoMeses == null || !proposito)
		return res.status(400).json({ error: 'clienteId, monto, plazoMeses y proposito son obligatorios' });

	const cliente = obtenerClientePorId(clienteId);
	if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

	if (!esNumero(monto) || +monto <= 0)
		return res.status(400).json({ error: 'monto debe ser numerico y mayor que 0' });

	if (!esNumero(plazoMeses) || +plazoMeses <= 0)
		return res.status(400).json({ error: 'plazoMeses debe ser numerico y mayor que 0' });

	const solicitud = {
		id: siguienteIdSolicitud++,
		clienteId: +clienteId,
		monto: +monto,
		plazoMeses: +plazoMeses,
		proposito: String(proposito).trim(),
		estado: 'borrador',
		scoreRiesgo: null,
		analisisVersionActual: null,
		infoAdicional: [],
		creadoEn: new Date(),
		actualizadoEn: new Date()
	};

	solicitudes.push(solicitud);
	registrarAuditoria({ solicitudId: solicitud.id, actor: 'cliente', accion: 'creacion', toEstado: 'borrador' });
	res.status(201).json(solicitud);
});

apiV1.put('/solicitudes/:id', (req, res) => {
	const id = +req.params.id;
	const indice = solicitudes.findIndex(s => s.id === id);
	if (indice === -1) return res.status(404).json({ error: 'Solicitud no encontrada' });

	const solicitud = solicitudes[indice];
	if (!['borrador', 'info requerida'].includes(solicitud.estado))
		return res.status(400).json({ error: 'Solo se puede editar una solicitud en borrador o info requerida' });

	const { monto, plazoMeses, proposito, infoAdicional, ...resto } = req.body;

	if (monto !== undefined && (!esNumero(monto) || +monto <= 0))
		return res.status(400).json({ error: 'monto debe ser numerico y mayor que 0' });

	if (plazoMeses !== undefined && (!esNumero(plazoMeses) || +plazoMeses <= 0))
		return res.status(400).json({ error: 'plazoMeses debe ser numerico y mayor que 0' });

	const actualizado = { ...solicitud, ...resto };
	if (monto !== undefined) actualizado.monto = +monto;
	if (plazoMeses !== undefined) actualizado.plazoMeses = +plazoMeses;
	if (proposito !== undefined) actualizado.proposito = String(proposito).trim();
	actualizado.actualizadoEn = new Date();

	if (infoAdicional !== undefined) {
		const base = Array.isArray(solicitud.infoAdicional) ? solicitud.infoAdicional.slice() : [];
		const normalizarEntrada = (entrada) => {
			if (entrada && typeof entrada === 'object' && entrada.detalle) {
				return {
					detalle: String(entrada.detalle),
					registradoEn: entrada.registradoEn ? new Date(entrada.registradoEn) : new Date()
				};
			}
			return { detalle: String(entrada), registradoEn: new Date() };
		};

		if (Array.isArray(infoAdicional)) {
			base.push(...infoAdicional.map(normalizarEntrada));
		} else {
			base.push(normalizarEntrada(infoAdicional));
		}

		actualizado.infoAdicional = base;
	}

	solicitudes[indice] = actualizado;
	registrarAuditoria({ solicitudId: actualizado.id, actor: 'cliente', accion: 'actualizacion' });
	res.json(actualizado);
});

apiV1.delete('/solicitudes/:id', (req, res) => {
	const indice = solicitudes.findIndex(s => s.id === +req.params.id);
	if (indice === -1) return res.status(404).json({ error: 'Solicitud no encontrada' });

	if (solicitudes[indice].estado !== 'borrador')
		return res.status(400).json({ error: 'Solo se puede eliminar una solicitud en borrador' });

	const [eliminada] = solicitudes.splice(indice, 1);
	registrarAuditoria({ solicitudId: eliminada.id, actor: 'cliente', accion: 'eliminacion' });
	res.json(eliminada);
});

apiV1.post('/solicitudes/:id/enviar', (req, res) => {
	const actor = exigirActor(req, res, ['cliente']);
	if (!actor) return;

	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

	const transicion = cambiarEstado(solicitud, 'enviada', actor, 'envio de solicitud');
	if (!transicion.ok) return res.status(transicion.status).json({ error: transicion.error });

	const resultado = ejecutarAnalisis(solicitud, { simularTimeout: req.query.simularTimeout === 'true' });
	if (!resultado.ok)
		return res.status(resultado.status).json({ error: resultado.error, estadoActual: solicitud.estado });

	res.json({ solicitud, analisis: resultado.analisis });
});

apiV1.post('/solicitudes/:id/solicitar-info', (req, res) => {
	const actor = exigirActor(req, res, ['analista']);
	if (!actor) return;

	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

	const transicion = cambiarEstado(solicitud, 'info requerida', actor, 'solicitud de informacion adicional');
	if (!transicion.ok) return res.status(transicion.status).json({ error: transicion.error });

	solicitud.docsSolicitados = Array.isArray(req.body.docsSolicitados) ? req.body.docsSolicitados : [];
	res.json(solicitud);
});

apiV1.post('/solicitudes/:id/reanalizar', (req, res) => {
	const actor = exigirActor(req, res, ['agente']);
	if (!actor) return;

	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

	if (solicitud.estado !== 'info requerida')
		return res.status(400).json({ error: 'Solo se puede reanalizar cuando la solicitud esta en info requerida' });

	const resultado = ejecutarAnalisis(solicitud, { simularTimeout: req.query.simularTimeout === 'true' });
	if (!resultado.ok)
		return res.status(resultado.status).json({ error: resultado.error, estadoActual: solicitud.estado });

	res.json({ solicitud, analisis: resultado.analisis });
});

apiV1.get('/solicitudes/:id/analisis', (req, res) => {
	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

	const lista = analisis.filter(a => a.solicitudId === solicitud.id);
	if (req.query.ultimo === 'true') {
		const ultimo = lista[lista.length - 1] || null;
		return res.json(ultimo);
	}
	res.json(lista);
});

apiV1.post('/solicitudes/:id/revision', (req, res) => {
	const actor = exigirActor(req, res, ['analista']);
	if (!actor) return;

	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

	if (solicitud.estado !== 'en revision')
		return res.status(400).json({ error: 'La solicitud debe estar en revision' });

	const { analista, decisionFinal, justificacion, docsAdicionalesSolicitados = [] } = req.body;

	if (!analista || !decisionFinal || !justificacion)
		return res.status(400).json({ error: 'analista, decisionFinal y justificacion son obligatorios' });

	const decisionNorm = normalizar(decisionFinal);
	if (!['aprobada', 'rechazada', 'info requerida'].includes(decisionNorm))
		return res.status(400).json({ error: 'decisionFinal invalida. Use: aprobada, rechazada o info requerida' });

	const ultimoAnalisis = analisis.filter(a => a.solicitudId === solicitud.id).slice(-1)[0];
	if (!ultimoAnalisis) return res.status(400).json({ error: 'No existe un analisis para revisar' });

	const revision = {
		id: siguienteIdRevision++,
		solicitudId: solicitud.id,
		analisisId: ultimoAnalisis.id,
		analisisVersion: ultimoAnalisis.version,
		analista: String(analista).trim(),
		decisionFinal: decisionNorm,
		justificacion: String(justificacion).trim(),
		docsAdicionalesSolicitados: Array.isArray(docsAdicionalesSolicitados) ? docsAdicionalesSolicitados : [],
		creadoEn: new Date()
	};

	revisiones.push(revision);

	const transicion = cambiarEstado(solicitud, decisionNorm, actor, 'revision humana');
	if (!transicion.ok) return res.status(transicion.status).json({ error: transicion.error });

	if (decisionNorm === 'aprobada') {
		const credito = crearCreditoDesdeSolicitud(solicitud);
		return res.json({ solicitud, revision, credito });
	}

	if (decisionNorm === 'info requerida') {
		solicitud.docsSolicitados = revision.docsAdicionalesSolicitados;
	}

	res.json({ solicitud, revision });
});

apiV1.get('/solicitudes/:id/revision', (req, res) => {
	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
	const lista = revisiones.filter(r => r.solicitudId === solicitud.id);
	res.json(lista);
});

apiV1.get('/solicitudes/:id/auditoria', (req, res) => {
	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
	res.json(auditoria.filter(a => a.solicitudId === solicitud.id));
});

apiV1.get('/creditos', (req, res) => {
	const { clienteId, estadoMora } = req.query;
	let resultados = creditos.slice();

	if (clienteId) resultados = resultados.filter(c => c.clienteId === +clienteId);
	if (estadoMora) resultados = resultados.filter(c => normalizar(c.estadoMora) === normalizar(estadoMora));

	res.json(resultados);
});

apiV1.get('/creditos/:id', (req, res) => {
	const credito = creditos.find(c => c.id === +req.params.id);
	if (!credito) return res.status(404).json({ error: 'Credito no encontrado' });
	res.json(credito);
});

apiV1.post('/creditos', (req, res) => {
	const { solicitudId } = req.body;
	if (!solicitudId) return res.status(400).json({ error: 'solicitudId es obligatorio' });

	const solicitud = solicitudes.find(s => s.id === +solicitudId);
	if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
	if (solicitud.estado !== 'aprobada')
		return res.status(400).json({ error: 'La solicitud debe estar aprobada para crear el credito' });

	const credito = crearCreditoDesdeSolicitud(solicitud);
	res.status(201).json(credito);
});

apiV1.put('/creditos/:id', (req, res) => {
	const indice = creditos.findIndex(c => c.id === +req.params.id);
	if (indice === -1) return res.status(404).json({ error: 'Credito no encontrado' });

	const actualizado = { ...creditos[indice], ...req.body, id: creditos[indice].id };
	creditos[indice] = actualizado;
	res.json(actualizado);
});

apiV1.delete('/creditos/:id', (req, res) => {
	const indice = creditos.findIndex(c => c.id === +req.params.id);
	if (indice === -1) return res.status(404).json({ error: 'Credito no encontrado' });
	const [eliminado] = creditos.splice(indice, 1);
	res.json(eliminado);
});

apiV1.post('/creditos/:id/pagos', (req, res) => {
	const credito = creditos.find(c => c.id === +req.params.id);
	if (!credito) return res.status(404).json({ error: 'Credito no encontrado' });

	const { monto, fechaPago = null, diasAtraso = 0 } = req.body;
	if (!esNumero(monto) || +monto <= 0) return res.status(400).json({ error: 'monto debe ser numerico y mayor que 0' });

	const pago = {
		id: siguienteIdPago++,
		monto: +monto,
		fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
		diasAtraso: esNumero(diasAtraso) ? +diasAtraso : 0
	};

	credito.pagos.push(pago);
	credito.saldo = Math.max(0, +credito.saldo - +monto);

	if (pago.diasAtraso >= 60) credito.estadoMora = 'moroso';
	else if (pago.diasAtraso > 0) credito.estadoMora = 'en mora';
	else credito.estadoMora = 'al dia';

	if (credito.saldo === 0) credito.estado = 'cancelado';

	res.status(201).json({ credito, pago });
});

apiV1.get('/reportes/resumen', (req, res) => {
	const resoluciones = solicitudes.filter(s => ['aprobada', 'rechazada'].includes(s.estado));
	const aprobadas = resoluciones.filter(s => s.estado === 'aprobada').length;
	const rechazadas = resoluciones.filter(s => s.estado === 'rechazada').length;

	const scoreBuckets = {
		'0-49': 0,
		'50-69': 0,
		'70-100': 0
	};

	for (const solicitud of resoluciones) {
		const score = solicitud.scoreRiesgo;
		if (!esNumero(score)) continue;
		if (score < 50) scoreBuckets['0-49'] += 1;
		else if (score < 70) scoreBuckets['50-69'] += 1;
		else scoreBuckets['70-100'] += 1;
	}

	const montosBuckets = {
		'0-1000': 0,
		'1000-5000': 0,
		'5000-10000': 0,
		'10000+': 0
	};

	for (const solicitud of solicitudes) {
		const monto = +solicitud.monto;
		if (monto < 1000) montosBuckets['0-1000'] += 1;
		else if (monto < 5000) montosBuckets['1000-5000'] += 1;
		else if (monto < 10000) montosBuckets['5000-10000'] += 1;
		else montosBuckets['10000+'] += 1;
	}

	let totalHoras = 0;
	let conteoHoras = 0;
	for (const solicitud of resoluciones) {
		const inicio = auditoria.find(a => a.solicitudId === solicitud.id && a.toEstado === 'enviada');
		const fin = auditoria.find(a => a.solicitudId === solicitud.id && ['aprobada', 'rechazada'].includes(a.toEstado));
		if (inicio && fin) {
			const diffMs = new Date(fin.fecha) - new Date(inicio.fecha);
			totalHoras += diffMs / (1000 * 60 * 60);
			conteoHoras += 1;
		}
	}

	const promedioHoras = conteoHoras ? +(totalHoras / conteoHoras).toFixed(2) : 0;

	res.json({
		totalSolicitudes: solicitudes.length,
		resoluciones: resoluciones.length,
		aprobadas,
		rechazadas,
		tasaAprobacion: resoluciones.length ? +(aprobadas / resoluciones.length).toFixed(2) : 0,
		aprobacionPorScore: scoreBuckets,
		tiempoPromedioResolucionHoras: promedioHoras,
		distribucionMontos: montosBuckets
	});
});

apiV1.get('/health', (req, res) => {
	res.json({ status: 'ok', version: 'v1' });
});

// APIV2

apiV2.get('/status', (req, res) => {
	res.json({
		status: 'ok',
		version: 'v2',
		message: 'AgentCredit API v2 funcionando'
	});
});

const crearAnalisisV2 = (solicitud, cliente) => {
	const ingresos = esNumero(cliente.ingresosMensuales) ? +cliente.ingresosMensuales : 0;
	const monto = esNumero(solicitud.monto) ? +solicitud.monto : 0;
	const plazo = esNumero(solicitud.plazoMeses) ? +solicitud.plazoMeses : 0;

	const documentosVerificados = cliente.documentos.length > 0 ? 5 : 0;

	const reanalisisPrevios = solicitud.id
		? analisis.filter(a => a.solicitudId === solicitud.id).length
		: 0;

	const scoreBruto =
		60 +
		(ingresos / 1000) * 10 -
		(monto / 1000) * 6 -
		(plazo / 12) * 4 +
		documentosVerificados -
		(reanalisisPrevios * 3);

	const score = Math.max(0, Math.min(100, Math.round(scoreBruto)));

	const variables = [
		{ nombre: 'ingresosMensuales', valor: ingresos, peso: 0.45 },
		{ nombre: 'montoSolicitado', valor: monto, peso: -0.35 },
		{ nombre: 'plazoMeses', valor: plazo, peso: -0.2 },
		{ nombre: 'documentosVerificados', valor: documentosVerificados > 0, peso: 0.05 },
		{ nombre: 'reanalisisPrevios', valor: reanalisisPrevios, peso: -0.03 }
	];

	const recomendacion = score >= 70
		? 'aprobar'
		: (score >= 50 ? 'revisar' : 'rechazar');

	const confianza = Math.max(0.4, Math.min(0.95, score / 100));

	const version = solicitud.id
		? analisis.filter(a => a.solicitudId === solicitud.id).length + 1
		: 1;

	return {
		id: siguienteIdAnalisis++,
		solicitudId: solicitud.id || null,
		version,
		score,
		variables,
		recomendacion,
		confianza,
		modeloVersion: 'v2.0',
		creadoEn: new Date()
	};
};

apiV2.patch('/solicitudes/:id/estado', (req, res) => {
	const actor = exigirActor(req, res);
	if (!actor) return;

	const solicitud = solicitudes.find(s => s.id === +req.params.id);
	if (!solicitud)
		return res.status(404).json({ error: 'Solicitud no encontrada' });

	const { estado, detalle = '' } = req.body;

	if (!estado)
		return res.status(400).json({ error: 'estado es obligatorio' });

	const desde = solicitud.estado;

	const resultado = cambiarEstado(solicitud, estado, actor, detalle);

	if (!resultado.ok) {
		const permitidos = TRANSICIONES_VALIDAS[solicitud.estado] || [];

		return res.status(resultado.status).json({
			error: {
				code: 'INVALID_TRANSITION',
				message: resultado.error,
				permitidos
			}
		});
	}

	return res.json({
		solicitud,
		cambio: {
			desde,
			hasta: estado,
			actor,
			fecha: solicitud.actualizadoEn
		}
	});
});

apiV2.post('/clientes/:id/pre-screening', (req, res) => {
	const cliente = obtenerClientePorId(req.params.id);

	if (!cliente)
		return res.status(404).json({ error: 'Cliente no encontrado' });

	const { montoDeseado, plazoMeses } = req.body;

	if (montoDeseado == null || plazoMeses == null)
		return res.status(400).json({
			error: 'montoDeseado y plazoMeses son obligatorios'
		});

	if (!esNumero(montoDeseado) || +montoDeseado <= 0)
		return res.status(400).json({
			error: 'montoDeseado debe ser numerico y mayor que 0'
		});

	if (!esNumero(plazoMeses) || +plazoMeses <= 0)
		return res.status(400).json({
			error: 'plazoMeses debe ser numerico y mayor que 0'
		});

	const solicitudTemp = {
		monto: +montoDeseado,
		plazoMeses: +plazoMeses
	};

	const resultado = crearAnalisisV2(solicitudTemp, cliente);

	const montoMaximoRecomendado = Math.max(
		1000,
		Math.round((cliente.ingresosMensuales || 0) * 4)
	);

	return res.json({
		cliente: {
			id: cliente.id,
			nombre: cliente.nombre
		},
		score: resultado.score,
		recomendacion: resultado.recomendacion,
		montoMaximoRecomendado,
		aprobadoPreliminar: resultado.score >= 50
	});
});

app.use('/api/v1', apiV1);
app.use('/api/v2', apiV2);

app.listen(3000, () => console.log('AgentCredit AI escuchando en http://localhost:3000'));
