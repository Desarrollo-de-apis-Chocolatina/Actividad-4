// Hospital Nacional San Rafael

const express = require('express');
const app = express();

app.use(express.json());

let pacientes = [];
let medicos = [];
let citas = [];
let expediente = [];

let siguienteIdPaciente = 1;
let siguienteIdMedico = 1;
let siguienteIdCita = 1;
let siguienteIdExpediente = 1;

const ESTADOS_MEDICO = ['activo', 'guardia', 'fuera de servicio'];
const ESTADOS_CITA = ['programada', 'en curso', 'completada', 'cancelada'];

const TRANSICIONES_VALIDAS = {
    'programada': ['en curso', 'cancelada'],
    'en curso': ['completada'],
    'completada': [],
    'cancelada': []
};

const normalizar = (texto) =>
    String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const horaAMinutos = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

const generarNumExpediente = (id) => `EXP-${String(id).padStart(4, '0')}`;

medicos.push(
    { id: siguienteIdMedico++, nombre: 'Dra. Alejandra Arriola', especialidad: 'Cardiología', departamento: 'Cardiología', horario: { inicio: '08:00', fin: '16:00' }, estado: 'activo' },
    { id: siguienteIdMedico++, nombre: 'Dra. Alisson Quijano', especialidad: 'Pediatría', departamento: 'Pediatría', horario: { inicio: '07:00', fin: '15:00' }, estado: 'activo' },
    { id: siguienteIdMedico++, nombre: 'Dra. Melisa Rivas', especialidad: 'Neurología', departamento: 'Neurología', horario: { inicio: '08:00', fin: '17:00' }, estado: 'activo' },
    { id: siguienteIdMedico++, nombre: 'Dr. Christian Renderos', especialidad: 'Traumatología', departamento: 'Traumatología', horario: { inicio: '09:00', fin: '18:00' }, estado: 'activo' },
    { id: siguienteIdMedico++, nombre: 'Dr. Gabriel Martínez', especialidad: 'Urgencias', departamento: 'Urgencias', horario: { inicio: '00:00', fin: '23:59' }, estado: 'guardia' }
);

pacientes.push(
    {
        id: siguienteIdPaciente,
        numeroExpediente: generarNumExpediente(siguienteIdPaciente++),
        dui: '11111111-1',
        nombre: 'Alejandra Arriola',
        tipoSangre: 'O+',
        alergias: ['penicilina'],
        contactoEmergencia: { nombre: 'javi Arriola', telefono: '7777-1111' },
        seguroMedico: 'ISSS'
    },
    {
        id: siguienteIdPaciente,
        numeroExpediente: generarNumExpediente(siguienteIdPaciente++),
        dui: '22222222-2',
        nombre: 'Alisson Quijano',
        tipoSangre: 'A+',
        alergias: [],
        contactoEmergencia: { nombre: 'Gabo Quijano', telefono: '7777-2222' },
        seguroMedico: 'Privado'
    },
    {
        id: siguienteIdPaciente,
        numeroExpediente: generarNumExpediente(siguienteIdPaciente++),
        dui: '33333333-3',
        nombre: 'Melisa Rivas',
        tipoSangre: 'B+',
        alergias: ['ibuprofeno'],
        contactoEmergencia: { nombre: 'Fer Rivas', telefono: '7777-3333' },
        seguroMedico: 'ISSS'
    },
    {
        id: siguienteIdPaciente,
        numeroExpediente: generarNumExpediente(siguienteIdPaciente++),
        dui: '44444444-4',
        nombre: 'Christian Renderos',
        tipoSangre: 'AB-',
        alergias: [],
        contactoEmergencia: { nombre: 'Lis Renderos', telefono: '7777-4444' },
        seguroMedico: 'Privado'
    },
    {
        id: siguienteIdPaciente,
        numeroExpediente: generarNumExpediente(siguienteIdPaciente++),
        dui: '55555555-5',
        nombre: 'Gabriel Martínez',
        tipoSangre: 'O-',
        alergias: ['aspirina'],
        contactoEmergencia: { nombre: 'Ali Martínez', telefono: '7777-5555' },
        seguroMedico: 'ISSS'
    }
);

app.get('/pacientes', (req, res) => {
    const { nombre, dui, expediente: numExp } = req.query;
    let resultados = pacientes.slice();

    if (nombre) resultados = resultados.filter(p => normalizar(p.nombre).includes(normalizar(nombre)));
    if (dui) resultados = resultados.filter(p => normalizar(p.dui).includes(normalizar(dui)));
    if (numExp) resultados = resultados.filter(p => normalizar(p.numeroExpediente).includes(normalizar(numExp)));

    res.json(resultados);
});

app.get('/pacientes/:id', (req, res) => {
    const paciente = pacientes.find(p => p.id === +req.params.id);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(paciente);
});

app.post('/pacientes', (req, res) => {
    const {
        dui,
        nombre,
        tipoSangre = '',
        alergias = [],
        contactoEmergencia = {},
        seguroMedico = ''
    } = req.body;

    if (!dui || !nombre)
        return res.status(400).json({ error: 'Los campos dui y nombre son obligatorios' });

    if (pacientes.some(p => normalizar(p.dui) === normalizar(dui)))
        return res.status(400).json({ error: 'Ya existe un paciente con ese DUI' });

    if (!Array.isArray(alergias))
        return res.status(400).json({ error: 'El campo alergias debe ser un arreglo' });

    const id = siguienteIdPaciente++;
    const paciente = {
        id,
        numeroExpediente: generarNumExpediente(id),
        dui: dui.trim(),
        nombre: nombre.trim(),
        tipoSangre,
        alergias,
        contactoEmergencia,
        seguroMedico
    };

    pacientes.push(paciente);
    res.status(201).json(paciente);
});

app.put('/pacientes/:id', (req, res) => {
    const id = +req.params.id;
    const indice = pacientes.findIndex(p => p.id === id);
    if (indice === -1) return res.status(404).json({ error: 'Paciente no encontrado' });

    const { dui } = req.body;
    if (dui && pacientes.some(p => p.id !== id && normalizar(p.dui) === normalizar(dui)))
        return res.status(400).json({ error: 'Ya existe otro paciente con ese DUI' });

    if (req.body.alergias !== undefined && !Array.isArray(req.body.alergias))
        return res.status(400).json({ error: 'El campo alergias debe ser un arreglo' });

    const actualizado = { ...pacientes[indice], ...req.body, id, numeroExpediente: pacientes[indice].numeroExpediente };
    pacientes[indice] = actualizado;
    res.json(actualizado);
});

app.delete('/pacientes/:id', (req, res) => {
    const indice = pacientes.findIndex(p => p.id === +req.params.id);
    if (indice === -1) return res.status(404).json({ error: 'Paciente no encontrado' });
    const [eliminado] = pacientes.splice(indice, 1);
    res.json(eliminado);
});

app.get('/pacientes/:id/expediente', (req, res) => {
    const paciente = pacientes.find(p => p.id === +req.params.id);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const historial = expediente
        .filter(e => e.pacienteId === +req.params.id)
        .sort((a, b) => new Date(a.fechaConsulta) - new Date(b.fechaConsulta));

    res.json(historial);
});

app.post('/pacientes/:id/expediente', (req, res) => {
    const pacienteId = +req.params.id;
    const paciente = pacientes.find(p => p.id === pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const {
        citaId,
        diagnostico,
        medicamentos = [],
        indicaciones = '',
        proximaCitaSugerida = null,
        medicoId
    } = req.body;

    if (!citaId || !diagnostico || !medicoId)
        return res.status(400).json({ error: 'Los campos citaId, diagnostico y medicoId son obligatorios' });

    const cita = citas.find(c => c.id === +citaId);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
    if (cita.pacienteId !== pacienteId)
        return res.status(400).json({ error: 'La cita no pertenece a este paciente' });

    const medico = medicos.find(m => m.id === +medicoId);
    if (!medico) return res.status(404).json({ error: 'Médico no encontrado' });

    if (!Array.isArray(medicamentos))
        return res.status(400).json({ error: 'El campo medicamentos debe ser un arreglo' });

    const entrada = {
        id: siguienteIdExpediente++,
        pacienteId,
        citaId: +citaId,
        diagnostico,
        medicamentos,
        indicaciones,
        proximaCitaSugerida: proximaCitaSugerida ? new Date(proximaCitaSugerida) : null,
        medicoId: +medicoId,
        fechaConsulta: new Date()
    };

    expediente.push(entrada);
    res.status(201).json(entrada);
});

app.get('/medicos', (req, res) => {
    const { especialidad, horaInicio, horaFin } = req.query;
    let resultados = medicos.slice();

    if (especialidad)
        resultados = resultados.filter(m => normalizar(m.especialidad).includes(normalizar(especialidad)));

    if (horaInicio) {
        const minInicio = horaAMinutos(horaInicio);
        resultados = resultados.filter(m => horaAMinutos(m.horario.inicio) <= minInicio);
    }

    if (horaFin) {
        const minFin = horaAMinutos(horaFin);
        resultados = resultados.filter(m => horaAMinutos(m.horario.fin) >= minFin);
    }

    res.json(resultados);
});

app.get('/medicos/:id', (req, res) => {
    const medico = medicos.find(m => m.id === +req.params.id);
    if (!medico) return res.status(404).json({ error: 'Médico no encontrado' });
    res.json(medico);
});

app.post('/medicos', (req, res) => {
    const {
        nombre,
        especialidad,
        departamento,
        horario = { inicio: '08:00', fin: '17:00' },
        estado = 'activo'
    } = req.body;

    if (!nombre || !especialidad || !departamento)
        return res.status(400).json({ error: 'Los campos nombre, especialidad y departamento son obligatorios' });

    if (!ESTADOS_MEDICO.includes(estado))
        return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS_MEDICO.join(', ')}` });

    if (!horario.inicio || !horario.fin)
        return res.status(400).json({ error: 'El horario debe incluir inicio y fin (formato HH:MM)' });

    const medico = {
        id: siguienteIdMedico++,
        nombre,
        especialidad,
        departamento,
        horario,
        estado
    };

    medicos.push(medico);
    res.status(201).json(medico);
});

app.put('/medicos/:id', (req, res) => {
    const id = +req.params.id;
    const indice = medicos.findIndex(m => m.id === id);
    if (indice === -1) return res.status(404).json({ error: 'Médico no encontrado' });

    if (req.body.estado && !ESTADOS_MEDICO.includes(req.body.estado))
        return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS_MEDICO.join(', ')}` });

    const actualizado = { ...medicos[indice], ...req.body, id };
    medicos[indice] = actualizado;
    res.json(actualizado);
});

app.delete('/medicos/:id', (req, res) => {
    const indice = medicos.findIndex(m => m.id === +req.params.id);
    if (indice === -1) return res.status(404).json({ error: 'Médico no encontrado' });
    const [eliminado] = medicos.splice(indice, 1);
    res.json(eliminado);
});

app.get('/citas', (req, res) => res.json(citas));

app.get('/citas/hoy', (req, res) => {
    const hoy = new Date();
    const citasHoy = citas.filter(c => {
        const fh = new Date(c.fechaHora);
        return fh.getFullYear() === hoy.getFullYear() &&
               fh.getMonth() === hoy.getMonth() &&
               fh.getDate() === hoy.getDate();
    });

    const agrupadas = {};
    for (const cita of citasHoy) {
        const dep = cita.departamento || 'Sin departamento';
        if (!agrupadas[dep]) agrupadas[dep] = [];
        agrupadas[dep].push(cita);
    }

    res.json(agrupadas);
});

app.get('/citas/:id', (req, res) => {
    const cita = citas.find(c => c.id === +req.params.id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(cita);
});

app.post('/citas', (req, res) => {
    const { pacienteId, medicoId, fechaHora, motivo } = req.body;

    if (!pacienteId || !medicoId || !fechaHora || !motivo)
        return res.status(400).json({ error: 'Los campos pacienteId, medicoId, fechaHora y motivo son obligatorios' });

    const paciente = pacientes.find(p => p.id === +pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const medico = medicos.find(m => m.id === +medicoId);
    if (!medico) return res.status(404).json({ error: 'Médico no encontrado' });

    if (medico.estado === 'fuera de servicio')
        return res.status(400).json({ error: 'El médico está fuera de servicio y no puede atender citas' });

    const fechaCita = new Date(fechaHora);
    if (isNaN(fechaCita.getTime()))
        return res.status(400).json({ error: 'El formato de fechaHora no es válido' });

    const minCita = fechaCita.getHours() * 60 + fechaCita.getMinutes();
    const minInicio = horaAMinutos(medico.horario.inicio);
    const minFin = horaAMinutos(medico.horario.fin);

    if (minCita < minInicio || minCita >= minFin)
        return res.status(400).json({
            error: `El médico solo atiende de ${medico.horario.inicio} a ${medico.horario.fin}`
        });

    const conflicto = citas.find(c => {
        if (c.medicoId !== +medicoId) return false;
        if (c.estado === 'cancelada' || c.estado === 'completada') return false;
        const diffMs = Math.abs(new Date(c.fechaHora) - fechaCita);
        return diffMs < 60 * 60 * 1000;
    });

    if (conflicto)
        return res.status(400).json({
            error: `El médico ya tiene una cita agendada cercana a esa hora (cita #${conflicto.id})`
        });

    const cita = {
        id: siguienteIdCita++,
        pacienteId: +pacienteId,
        medicoId: +medicoId,
        fechaHora: fechaCita,
        motivo,
        estado: 'programada',
        departamento: medico.departamento
    };

    citas.push(cita);
    res.status(201).json(cita);
});

app.patch('/citas/:id/estado', (req, res) => {
    const id = +req.params.id;
    const indice = citas.findIndex(c => c.id === id);
    if (indice === -1) return res.status(404).json({ error: 'Cita no encontrada' });

    const { estado } = req.body;
    if (!estado) return res.status(400).json({ error: 'El campo estado es obligatorio' });

    if (!ESTADOS_CITA.includes(estado))
        return res.status(400).json({ error: `Estado inválido. Use: ${ESTADOS_CITA.join(', ')}` });

    const estadoActual = citas[indice].estado;
    if (!TRANSICIONES_VALIDAS[estadoActual].includes(estado))
        return res.status(400).json({
            error: `Transición inválida: de '${estadoActual}' a '${estado}' no está permitida`
        });

    citas[indice] = { ...citas[indice], estado };
    res.json(citas[indice]);
});

app.listen(3000, () => console.log('Hospital San Rafael escuchando en http://localhost:3000'));
