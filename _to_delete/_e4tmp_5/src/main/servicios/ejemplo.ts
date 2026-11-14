// Datos de ejemplo para probar sin cargar todo a mano: una veterinaria chica
// de Formosa con 3 veterinarios, 26 dueños con 32 mascotas y cuatro semanas
// de turnos. Solo se puede cargar si todavía no hay mascotas.
import type { BaseDeDatos } from '../db/conexion';
import { esquemaMascota, esquemaProfesional, esquemaUsuario } from '@compartido/esquemas';
import type { ResultadoEjemplo, Rol } from '@compartido/tipos';
import { guardarUsuario } from './usuarios';
import { ErrorDeUsuario } from './errores';
import { guardarMascota } from './mascotas';
import { guardarProfesional } from './profesionales';
import { resumen } from './veterinaria';
import { sumarMinutos, type EstadoTurno } from '@compartido/agenda';
import { aMinutos, diaDeLaSemana, horariosDeTurno } from '@compartido/horarios';
import { fechaLocal, horaLocal } from './fechas';
import { estaBloqueado } from './bloqueos';
import { sumarMeses } from '@compartido/vacunas';
import { normalizar } from './texto';
import { listarProfesionales } from './profesionales';
import { esquemaProducto, esquemaVenta } from '@compartido/esquemas';
import { guardarProducto, obtenerProducto } from './productos';
import { registrarVenta } from './ventas';

const dias = (lista: number[], desde: string, hasta: string) => lista.map((diaSemana) => ({ diaSemana, desde, hasta }));

const PROFESIONALES = [
  {
    titulo: 'Dra.', nombre: 'Laura', apellido: 'Benítez', especialidad: 'Clínica general', matricula: 'MV 412', color: 'eucalipto' as const,
    duracionTurnoMin: 20,
    precioConsultaCentavos: 1_500_000,
    horarios: [...dias([1, 2, 3, 4, 5], '08:30', '12:30'), ...dias([1, 3, 5], '16:30', '20:00')],
  },
  {
    titulo: 'Dr.', nombre: 'Martín', apellido: 'Acosta', especialidad: 'Cirugía', matricula: 'MV 387', color: 'ciruela' as const,
    duracionTurnoMin: 30,
    precioConsultaCentavos: 2_000_000,
    horarios: [...dias([2, 4], '09:00', '13:00'), ...dias([2, 4], '17:00', '20:00'), ...dias([6], '09:00', '12:00')],
  },
  {
    titulo: 'Dra.', nombre: 'Sofía', apellido: 'Ríos', especialidad: 'Dermatología', matricula: 'MV 529', color: 'ocre' as const,
    duracionTurnoMin: 30,
    precioConsultaCentavos: 1_800_000,
    horarios: dias([1, 3], '15:00', '19:00'),
  },
];

// [apellido, nombre, dni, teléfono, mascota, especie, raza, sexo, nacimiento, castrado, color]
type Fila = [string, string, string, string, string, 'perro' | 'gato' | 'conejo' | 'ave', string, 'macho' | 'hembra', string, boolean, string];
const MASCOTAS: Fila[] = [
  ['Aguirre', 'Ramón', '14567890', '370 455-1020', 'Bruno', 'perro', 'Labrador', 'macho', '2016-03-12', true, 'Chocolate'],
  ['Álvarez', 'Micaela', '38901234', '370 412-3344', 'Luna', 'gato', 'Siamés', 'hembra', '2021-07-21', true, 'Crema con puntas marrones'],
  ['Álvarez', 'Micaela', '38901234', '370 412-3344', 'Simón', 'gato', 'Común europeo', 'macho', '2022-02-10', true, 'Atigrado gris'],
  ['Benítez', 'Juan Cruz', '52345678', '370 466-7788', 'Toby', 'perro', 'Caniche', 'macho', '2019-11-02', false, 'Blanco'],
  ['Cabrera', 'Silvia', '22456789', '370 433-1122', 'Mora', 'perro', 'Mestiza', 'hembra', '2018-01-30', true, 'Negra con pecho blanco'],
  ['Cáceres', 'Nahuel', '45678123', '370 498-5566', 'Thor', 'perro', 'Ovejero alemán', 'macho', '2020-05-17', false, 'Negro y fuego'],
  ['Duarte', 'Graciela', '11234567', '370 421-9090', 'Pelusa', 'gato', 'Angora', 'hembra', '2014-09-08', true, 'Blanca'],
  ['Escobar', 'Lucas', '40123987', '370 477-2211', 'Rocky', 'perro', 'Bulldog francés', 'macho', '2021-12-03', false, 'Atigrado'],
  ['Fernández', 'Ana María', '17890456', '370 455-6677', 'Canela', 'perro', 'Cocker spaniel', 'hembra', '2017-04-25', true, 'Dorada'],
  ['Figueredo', 'Tomás', '55123456', '370 466-1010', 'Nala', 'perro', 'Golden retriever', 'hembra', '2023-02-14', false, 'Dorada clara'],
  ['Giménez', 'Rocío', '36789012', '370 411-8899', 'Milo', 'gato', 'Común europeo', 'macho', '2020-08-09', true, 'Naranja'],
  ['González', 'Héctor', '20345671', '370 499-3030', 'Chiquito', 'perro', 'Pequinés', 'macho', '2012-10-19', true, 'Beige'],
  ['Ibáñez', 'Valentina', '47890123', '370 432-4545', 'Copito', 'conejo', 'Cabeza de león', 'macho', '2023-03-28', false, 'Blanco y gris'],
  ['Leiva', 'Marcos', '33456120', '370 481-6060', 'Kira', 'perro', 'Husky siberiano', 'hembra', '2019-06-11', true, 'Gris y blanca'],
  ['López', 'Carmen', '9876543', '370 425-7070', 'Boby', 'perro', 'Mestizo', 'macho', '2011-12-24', true, 'Marrón'],
  ['Martínez', 'Agustina', '42345678', '370 444-1212', 'Frida', 'gato', 'Bengalí', 'hembra', '2022-01-15', false, 'Manchas doradas'],
  ['Martínez', 'Agustina', '42345678', '370 444-1212', 'Lola', 'perro', 'Beagle', 'hembra', '2020-09-02', true, 'Tricolor'],
  ['Medina', 'Pablo', '28901234', '370 455-3434', 'Zeus', 'perro', 'Rottweiler', 'macho', '2018-07-07', true, 'Negro y fuego'],
  ['Morínigo', 'Celeste', '53987654', '370 466-9898', 'Pipo', 'ave', 'Cacatúa ninfa', 'macho', '2021-09-30', false, 'Gris con mejillas naranjas'],
  ['Núñez', 'Ricardo', '16543210', '370 412-5656', 'Duke', 'perro', 'Dogo argentino', 'macho', '2017-02-02', false, 'Blanco'],
  ['Ojeda', 'Florencia', '39012345', '370 477-8080', 'Maya', 'gato', 'Persa', 'hembra', '2019-11-12', true, 'Gris humo'],
  ['Ortiz', 'Daniel', '25678901', '370 488-2323', 'Colita', 'perro', 'Mestiza', 'hembra', '2015-05-05', true, 'Canela'],
  ['Paredes', 'Lourdes', '43219876', '370 433-6767', 'Gus', 'perro', 'Salchicha', 'macho', '2022-08-18', false, 'Marrón'],
  ['Pereyra', 'Emilio', '56789012', '370 466-2424', 'Oso', 'perro', 'Pitbull', 'macho', '2020-04-04', true, 'Gris azulado'],
  ['Ramírez', 'Teresa', '13456789', '370 421-1313', 'Tigre', 'gato', 'Común europeo', 'macho', '2013-06-26', true, 'Atigrado'],
  ['Romero', 'Facundo', '37890123', '370 499-4747', 'Mía', 'perro', 'Border collie', 'hembra', '2021-10-01', false, 'Blanca y negra'],
  ['Sánchez', 'Elena', '24567890', '370 455-8181', 'Nube', 'gato', 'Ragdoll', 'hembra', '2020-03-16', true, 'Blanca con gris'],
  ['Sosa', 'Matías', '41234567', '370 411-9292', 'Max', 'perro', 'Boxer', 'macho', '2019-12-29', true, 'Rubio'],
  ['Torres', 'Liliana', '19876543', '370 432-1515', 'Ginger', 'gato', 'Común europeo', 'hembra', '2016-07-13', true, 'Naranja'],
  ['Vera', 'Joaquín', '54321098', '370 477-3636', 'Rex', 'perro', 'Ovejero alemán', 'macho', '2022-01-20', false, 'Negro'],
  ['Villalba', 'Norma', '12345678', '370 425-6464', 'Princesa', 'perro', 'Yorkshire', 'hembra', '2013-11-05', true, 'Gris acero y fuego'],
  ['Zárate', 'Gustavo', '30123456', '370 488-9595', 'Bamba', 'perro', 'Labrador', 'hembra', '2023-09-22', false, 'Negra'],
];

/** Usuarios para probar los roles (los PIN se muestran al cargarlos y están en la guía). */
const USUARIOS_EJEMPLO: { nombre: string; rol: Rol; pin: string; apellidoProfesional: string | null }[] = [
  { nombre: 'Marta', rol: 'recepcion', pin: '1111', apellidoProfesional: null },
  { nombre: 'Laura Benítez', rol: 'profesional', pin: '2222', apellidoProfesional: 'Benítez' },
  { nombre: 'Martín Acosta', rol: 'profesional', pin: '3333', apellidoProfesional: 'Acosta' },
  { nombre: 'Sofía Ríos', rol: 'profesional', pin: '4444', apellidoProfesional: 'Ríos' },
];

function crearUsuariosEjemplo(db: BaseDeDatos): ResultadoEjemplo['usuarios'] {
  const creados: ResultadoEjemplo['usuarios'] = [];
  for (const u of USUARIOS_EJEMPLO) {
    if (db.$client.prepare('SELECT 1 FROM usuarios WHERE activo = 1 AND nombre = ? COLLATE NOCASE').get(u.nombre)) continue;
    let profesionalId: number | null = null;
    if (u.apellidoProfesional) {
      const p = db.$client.prepare('SELECT id FROM profesionales WHERE apellido = ? AND activo = 1').get(u.apellidoProfesional) as { id: number } | undefined;
      if (!p || db.$client.prepare('SELECT 1 FROM usuarios WHERE activo = 1 AND profesional_id = ?').get(p.id)) continue;
      profesionalId = p.id;
    }
    guardarUsuario(db, esquemaUsuario.parse({ nombre: u.nombre, rol: u.rol, profesionalId, pin: u.pin }));
    creados.push({ nombre: u.nombre, rol: u.rol, pin: u.pin });
  }
  return creados;
}

export function cargarEjemplo(db: BaseDeDatos, ahora: Date = new Date()): ResultadoEjemplo {
  if ((db.$client.prepare('SELECT count(*) AS n FROM mascotas').get() as { n: number }).n > 0) {
    throw new ErrorDeUsuario('Ya hay mascotas cargadas: los datos de ejemplo son solo para una veterinaria vacía.');
  }
  const usuarios = db.$client.transaction(() => {
    const hayProfesionales = (db.$client.prepare('SELECT count(*) AS n FROM profesionales').get() as { n: number }).n > 0;
    if (!hayProfesionales) for (const p of PROFESIONALES) guardarProfesional(db, esquemaProfesional.parse(p));
    // Un dueño con dos mascotas se carga una sola vez: la segunda mascota reutiliza su id
    const duenoDe = new Map<string, number>();
    for (const [apellido, nombre, dni, telefono, mascota, especie, raza, sexo, fechaNacimiento, castrado, color] of MASCOTAS) {
      const id = guardarMascota(
        db,
        esquemaMascota.parse({
          nombre: mascota, especie, raza, sexo, castrado, fechaNacimiento, color,
          dueno: { id: duenoDe.get(dni), apellido, nombre, dni, telefono },
        }),
      );
      if (!duenoDe.has(dni)) duenoDe.set(dni, (db.$client.prepare('SELECT dueno_id AS id FROM mascotas WHERE id = ?').get(id) as { id: number }).id);
    }
    cargarVacunasEjemplo(db, ahora);
    cargarProductosEjemplo(db, ahora);
    const creados = hayProfesionales ? [] : crearUsuariosEjemplo(db);
    // Los turnos, solo con los veterinarios de ejemplo (de los propios no conocemos el horario real)
    if (!hayProfesionales) cargarTurnosEjemplo(db, ahora);
    return creados;
  })();
  return { ...resumen(db), usuarios };
}

// Cuándo toca la próxima dosis de la antirrábica, en días desde hoy: algunas ya vencidas,
// otras esta semana o este mes y el resto más adelante (así la pantalla Vacunas tiene de todo).
const DESPLAZAMIENTOS_RABIA = [-35, 3, 18, -9, 120, 6, 250, -2, 26, 75, 190, 11];

/**
 * Carnets de ejemplo para una veterinaria que ya tiene mascotas pero todavía no tiene
 * vacunas cargadas (por ejemplo, el ejemplo se cargó antes de que existiera esta pantalla).
 */
export function cargarVacunasEjemploSueltas(db: BaseDeDatos, ahora: Date = new Date()): number {
  if ((db.$client.prepare('SELECT count(*) AS n FROM aplicaciones').get() as { n: number }).n > 0) {
    throw new ErrorDeUsuario('Ya hay vacunas cargadas: las de ejemplo son solo para un carnet vacío.');
  }
  const hayMascotas = db.$client.prepare(`SELECT 1 FROM mascotas WHERE especie IN ('perro', 'gato') AND activo = 1 LIMIT 1`).get();
  if (!hayMascotas) throw new ErrorDeUsuario('Primero cargá mascotas (perros o gatos).');
  db.$client.transaction(() => cargarVacunasEjemplo(db, ahora))();
  return (db.$client.prepare('SELECT count(*) AS n FROM aplicaciones').get() as { n: number }).n;
}

/** Carnets de vacunación de ejemplo para perros y gatos (los demás animales no llevan). */
function cargarVacunasEjemplo(db: BaseDeDatos, ahora: Date): void {
  const hoy = fechaLocal(ahora);
  const dia = (desplazamiento: number) => fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + desplazamiento, 12));
  const insertar = db.$client.prepare(
    `INSERT INTO aplicaciones (mascota_id, tipo, nombre, clave, fecha, proxima_dosis, lote, avisado_en, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const mascotas = db.$client.prepare(`SELECT id, especie, fecha_nacimiento AS nacimiento FROM mascotas WHERE especie IN ('perro', 'gato') ORDER BY id`).all() as {
    id: number;
    especie: string;
    nacimiento: string | null;
  }[];
  mascotas.forEach((m, i) => {
    // Una aplicación solo se carga si la mascota ya había nacido ese día
    const poner = (nombre: string, tipo: 'vacuna' | 'desparasitacion', proxima: string, meses: number, avisado: boolean) => {
      const fecha = sumarMeses(proxima, -meses);
      if (fecha > hoy || (m.nacimiento && fecha < m.nacimiento)) return;
      // Si ya le tocaba avisar y no se avisó, queda para que el ejemplo muestre las dos cosas
      insertar.run(m.id, tipo, nombre, normalizar(nombre), fecha, proxima, `L${String(1000 + i * 7)}`, avisado ? `${hoy} 09:00:00` : null, `${fecha} 12:00:00`);
    };
    const proximaRabia = dia(DESPLAZAMIENTOS_RABIA[i % DESPLAZAMIENTOS_RABIA.length]!);
    // La dosis del año anterior (ya renovada): se ve en el carnet pero nunca figura como pendiente
    poner('Antirrábica', 'vacuna', sumarMeses(proximaRabia, -12), 12, false);
    poner('Antirrábica', 'vacuna', proximaRabia, 12, proximaRabia < hoy && i % 3 === 0);
    const principal = m.especie === 'perro' ? 'Quíntuple / Séxtuple' : 'Triple felina';
    if (i % 4 !== 3) poner(principal, 'vacuna', dia(DESPLAZAMIENTOS_RABIA[(i + 5) % DESPLAZAMIENTOS_RABIA.length]! + 40), 12, false);
    if (i % 3 !== 2) poner('Desparasitación interna', 'desparasitacion', dia(((i * 11) % 100) - 14), 3, false);
  });
}

/** Números "al azar" pero siempre los mismos (semilla fija): la demo sale igual cada vez. */
function azar(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Notas de consulta de ejemplo según la especialidad (texto de muestra, no son indicaciones reales)
type Nota = [motivo: string, evolucion: string, diagnostico: string, indicaciones: string];
const NOTAS: Record<string, Nota[]> = {
  'Clínica general': [
    ['Control anual', 'Buen estado general. Mucosas rosadas, temperatura normal, auscultación sin particularidades.', 'Control de salud', 'Vacunas al día. Próximo control en 12 meses.'],
    ['Vómitos', 'Dos días con vómitos y poco apetito. Abdomen blando, sin dolor marcado. Hidratación aceptable.', 'Gastroenteritis leve', 'Dieta blanda 48 horas y agua fresca. Volver si sigue vomitando.'],
    ['Cojera', 'Cojea de la pata trasera derecha desde ayer. Sin inflamación visible, dolor al flexionar.', 'Esguince leve', 'Reposo 7 días, sin escaleras ni carreras. Antiinflamatorio según receta.'],
    ['Vacunación', 'Se revisa el carnet y se aplica la vacuna correspondiente sin reacciones.', 'Vacuna aplicada', 'Próxima dosis según carnet. Observar 24 horas.'],
  ],
  Cirugía: [
    ['Castración', 'Preoperatorio normal. Ayuno de 8 horas cumplido. Se realiza sin complicaciones.', 'Castración', 'Collar isabelino 10 días. Control y retiro de puntos en 10 días.'],
    ['Control posoperatorio', 'Herida seca y sin secreción. Buen apetito y ánimo.', 'Posoperatorio favorable', 'Se retiran los puntos. Alta quirúrgica.'],
    ['Limpieza dental', 'Sarro grado 2 con gingivitis. Se realiza limpieza bajo anestesia sin complicaciones.', 'Enfermedad periodontal leve', 'Alimento blando 24 horas. Cepillado semanal.'],
  ],
  Dermatología: [
    ['Picazón', 'Se rasca hace semanas, zonas con pérdida de pelo en lomo y base de la cola. Se descartan pulgas.', 'Dermatitis alérgica', 'Baños medicados 2 veces por semana. Cambio de alimento según indicación.'],
    ['Otitis', 'Sacude la cabeza y tiene secreción oscura en el oído izquierdo. Dolor a la palpación.', 'Otitis externa', 'Limpieza con solución ótica y gotas cada 12 horas por 10 días.'],
  ],
};
const METODOS_EJEMPLO = ['efectivo', 'efectivo', 'transferencia', 'transferencia', 'debito'] as const;

/**
 * Turnos de ejemplo: de 14 días atrás a 14 días adelante. Los pasados quedan
 * atendidos (con algún ausente y cancelado), los de hoy según la hora, y los
 * próximos se van vaciando a medida que se alejan (como en una agenda real).
 * Solo si todavía no hay turnos.
 */
export function cargarTurnosEjemplo(db: BaseDeDatos, ahora: Date = new Date()): number {
  if ((db.$client.prepare('SELECT count(*) AS n FROM turnos').get() as { n: number }).n > 0) {
    throw new ErrorDeUsuario('Ya hay turnos cargados: los turnos de ejemplo son solo para una agenda vacía.');
  }
  const filasMascotas = db.$client.prepare('SELECT id, especie FROM mascotas WHERE activo = 1 ORDER BY id').all() as { id: number; especie: string }[];
  const mascotas = filasMascotas.map((m) => m.id);
  // Peso de partida según la especie (kg); en cada visita varía un poco, como pasa de verdad
  const pesoBase = new Map(
    filasMascotas.map((m) => [m.id, m.especie === 'perro' ? 6 + (m.id % 6) * 5 : m.especie === 'gato' ? 3 + (m.id % 4) * 0.6 : 1 + (m.id % 3) * 0.4]),
  );
  // Quién hizo cada cosa: la recepción da los turnos y cobra; cada profesional escribe sus notas
  const recepcion = (db.$client.prepare(`SELECT id FROM usuarios WHERE activo = 1 AND rol = 'recepcion' ORDER BY id LIMIT 1`).get() as { id: number } | undefined)?.id ?? null;
  const usuarioDe = new Map(
    (db.$client.prepare('SELECT profesional_id AS p, id FROM usuarios WHERE activo = 1 AND profesional_id IS NOT NULL').all() as { p: number; id: number }[]).map((u) => [u.p, u.id]),
  );
  const consulta = db.$client.prepare(
    `INSERT INTO consultas (turno_id, mascota_id, profesional_id, fecha, motivo, evolucion, diagnostico, indicaciones, peso_gramos, temperatura_decimas, creado_en, actualizado_en, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const cobro = db.$client.prepare(
    'INSERT INTO cobros (turno_id, monto_centavos, metodo, creado_en, usuario_id) VALUES (?, ?, ?, ?, ?)',
  );
  const profesionales = listarProfesionales(db).filter((p) => p.activo && p.horarios.length);
  if (!mascotas.length || !profesionales.length) throw new ErrorDeUsuario('Primero cargá veterinarios con horario y mascotas.');

  const r = azar(20261110);
  const hoy = fechaLocal(ahora);
  const minutoActual = aMinutos(horaLocal(ahora));
  const insertar = db.$client.prepare(
    'INSERT INTO turnos (profesional_id, mascota_id, fecha, desde, hasta, estado, motivo, llego_en, creado_en, dado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // Cada mascota, como mucho un turno por día (y así nunca se pisan)
  const conTurno = new Set<string>();
  let creados = 0;

  db.$client.transaction(() => {
    for (let desplazamiento = -14; desplazamiento <= 14; desplazamiento++) {
      const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + desplazamiento, 12);
      const fecha = fechaLocal(dia);
      for (const p of profesionales) {
        const franjas = p.horarios.filter((h) => h.diaSemana === diaDeLaSemana(fecha));
        if (!franjas.length || estaBloqueado(db, p.id, fecha)) continue;
        // Cuánto se llena la agenda: mucho lo pasado y lo cercano, poco lo lejano
        const ocupacion = desplazamiento <= 0 ? 0.78 : Math.max(0.12, 0.72 - desplazamiento * 0.05);
        for (const desde of horariosDeTurno(franjas, p.duracionTurnoMin)) {
          if (r() > ocupacion) continue;
          const hasta = sumarMinutos(desde, p.duracionTurnoMin);
          let mascota: number | undefined;
          for (let intento = 0; intento < 6 && mascota === undefined; intento++) {
            const candidato = mascotas[Math.floor(r() * mascotas.length)]!;
            if (conTurno.has(`${candidato}|${fecha}`)) continue;
            mascota = candidato;
            conTurno.add(`${candidato}|${fecha}`);
          }
          if (mascota === undefined) continue;

          const x = r();
          let estado: EstadoTurno;
          if (fecha < hoy || (fecha === hoy && aMinutos(hasta) <= minutoActual)) estado = x < 0.08 ? 'cancelado' : x < 0.2 ? 'ausente' : 'atendido';
          else if (fecha === hoy && aMinutos(desde) <= minutoActual) estado = 'en_sala';
          else if (desplazamiento <= 1) estado = x < 0.05 ? 'cancelado' : x < 0.6 ? 'confirmado' : 'reservado';
          else estado = x < 0.05 ? 'cancelado' : 'reservado';

          // Llegada: entre 15 minutos antes y 5 después del turno
          let llegada = Math.max(0, aMinutos(desde) - 15 + Math.floor(r() * 20));
          if (fecha === hoy) llegada = Math.min(llegada, minutoActual); // no puede haber llegado "en el futuro"
          const llegoEn = estado === 'atendido' || estado === 'en_sala' ? `${fecha} ${sumarMinutos('00:00', llegada)}:00` : null;
          const creado = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - 1 - Math.floor(r() * 10), 10);
          const notas = NOTAS[p.especialidad] ?? NOTAS['Clínica general']!;
          const nota = notas[Math.floor(r() * notas.length)]!;
          const turnoId = Number(insertar.run(p.id, mascota, fecha, desde, hasta, estado, nota[0], llegoEn, `${fechaLocal(creado)} 10:00:00`, recepcion).lastInsertRowid);
          creados++;

          // Atendidos: con sus notas (cargadas al terminar el turno) y casi siempre cobrados.
          // Hoy quedan algunos sin cobrar, y a algunos en sala ya se les cobró al llegar.
          const momento = `${fecha} ${hasta}:00`;
          if (estado === 'atendido') {
            const gramos = Math.round(((pesoBase.get(mascota) ?? 5) + desplazamiento * 0.03 + (r() - 0.5) * 0.2) * 10) * 100;
            const decimas = r() < 0.15 ? 396 + Math.floor(r() * 10) : 382 + Math.floor(r() * 9); // algunas con fiebre
            consulta.run(turnoId, mascota, p.id, fecha, nota[0], nota[1], nota[2], nota[3], gramos, decimas, momento, momento, usuarioDe.get(p.id) ?? null);
          }
          const cobrar = (estado === 'atendido' && (fecha < hoy || r() < 0.55)) || (estado === 'en_sala' && r() < 0.35);
          if (cobrar) {
            const metodo = METODOS_EJEMPLO[Math.floor(r() * METODOS_EJEMPLO.length)]!;
            cobro.run(turnoId, p.precioConsultaCentavos || 1_500_000, metodo, momento, recepcion);
          }
        }
      }
    }
  })();
  return creados;
}

// ── Productos y ventas del mostrador ──
// [código, nombre, categoría, unidad, costo $, precio $, stock mínimo, stock inicial]
const PRODUCTOS: [string, string, string, 'unidad' | 'kg', number, number, number, number][] = [
  ['7790001000011', 'Alimento perro adulto (suelto)', 'alimento', 'kg', 2800, 3800, 20, 140],
  ['7790001000028', 'Alimento perro cachorro (suelto)', 'alimento', 'kg', 3200, 4300, 15, 70],
  ['7790001000035', 'Alimento gato adulto (suelto)', 'alimento', 'kg', 3500, 4700, 12, 60],
  ['7790001000042', 'Alimento gato castrado (suelto)', 'alimento', 'kg', 3700, 4900, 10, 9],
  ['7790001000059', 'Balanceado perro adulto 15 kg', 'alimento', 'unidad', 42000, 56000, 3, 12],
  ['7790001000066', 'Pipeta antipulgas perro mediano', 'medicamento', 'unidad', 6500, 9800, 6, 26],
  ['7790001000073', 'Pipeta antipulgas gato', 'medicamento', 'unidad', 5800, 8700, 6, 5], // ya viene con stock bajo
  ['7790001000080', 'Antiparasitario en comprimidos', 'medicamento', 'unidad', 3100, 4600, 8, 30],
  ['7790001000097', 'Collar antipulgas', 'medicamento', 'unidad', 7200, 10900, 4, 0],
  ['7790001000103', 'Shampoo medicado 250 ml', 'higiene', 'unidad', 4800, 7400, 5, 14],
  ['7790001000110', 'Shampoo neutro 250 ml', 'higiene', 'unidad', 3300, 5200, 5, 18],
  ['7790001000127', 'Arena sanitaria 4 kg', 'higiene', 'unidad', 4100, 6300, 6, 22],
  ['', 'Cepillo para pelo largo', 'accesorio', 'unidad', 2900, 4800, 3, 11],
  ['', 'Correa reforzada', 'accesorio', 'unidad', 5200, 8500, 3, 8],
  ['7790001000134', 'Snack dental', 'otro', 'unidad', 1400, 2400, 10, 40],
];

/** Productos con stock y ventas de los últimos 14 días (siempre las mismas: la demo sale igual cada vez). */
export function cargarProductosEjemplo(db: BaseDeDatos, ahora: Date = new Date()): number {
  if ((db.$client.prepare('SELECT count(*) AS n FROM productos').get() as { n: number }).n > 0) {
    throw new ErrorDeUsuario('Ya hay productos cargados: los de ejemplo son solo para un mostrador vacío.');
  }
  const usuario = db.$client.prepare(`SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
  const dia = (desp: number, hora: number, minuto: number) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + desp, hora, minuto);
  db.$client.transaction(() => {
    const ids = PRODUCTOS.map(([codigo, nombre, categoria, unidad, costo, precio, minimo, stock]) =>
      guardarProducto(
        db,
        esquemaProducto.parse({ codigo, nombre, categoria, unidad, costoCentavos: costo * 100, precioCentavos: precio * 100, stockMinimo: minimo, stockInicial: stock }),
        usuario ?? null,
        dia(-15, 9, 0),
      ),
    );
    const r = azar(2027);
    for (let atras = 14; atras >= 0; atras--) {
      const cuantas = atras === 0 ? 3 : 2 + Math.floor(r() * 5);
      for (let n = 0; n < cuantas; n++) {
        // Hoy, las ventas son entre las 9 y "ahora" (no del futuro); los otros días, a lo largo de la jornada
        const apertura = dia(0, 9, 0);
        const momento = atras === 0 ? new Date(apertura.getTime() + r() * Math.max(0, ahora.getTime() - apertura.getTime())) : dia(-atras, 9 + Math.floor(r() * 10), Math.floor(r() * 60));
        if (momento > ahora || (atras === 0 && ahora <= apertura)) continue;
        const items: { productoId: number; cantidad: number }[] = [];
        for (let k = 0, renglones = 1 + Math.floor(r() * 3); k < renglones; k++) {
          const p = obtenerProducto(db, ids[Math.floor(r() * ids.length)]!);
          if (items.some((i) => i.productoId === p.id) || p.stockMilesimas <= 0) continue;
          const pedida = p.unidad === 'kg' ? [0.5, 1, 1, 2, 3, 5][Math.floor(r() * 6)]! : 1 + Math.floor(r() * 2);
          // El ejemplo nunca baja un producto hasta el mínimo: así solo quedan con aviso los que ya venían bajos o sin stock
          const paso = p.unidad === 'kg' ? 0.5 : 1;
          const disponible = (p.stockMilesimas - p.stockMinimoMilesimas) / 1000 - paso;
          const cantidad = Math.min(pedida, Math.floor(disponible / paso) * paso);
          if (cantidad > 0) items.push({ productoId: p.id, cantidad });
        }
        if (items.length === 0) continue;
        const metodo = METODOS_EJEMPLO[Math.floor(r() * METODOS_EJEMPLO.length)]!;
        registrarVenta(db, esquemaVenta.parse({ items, metodo }), usuario ?? null, momento);
      }
    }
  })();
  return (db.$client.prepare('SELECT count(*) AS n FROM ventas').get() as { n: number }).n;
}
