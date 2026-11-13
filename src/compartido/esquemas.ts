// Reglas de los datos que viajan de la ventana al proceso main.
// Zod las revisa en el main (nunca confiamos en lo que manda la ventana) y
// TypeScript saca de acá los tipos, así la ventana y el main hablan igual.
import { z } from 'zod';
import { aMinutos, esHora } from './horarios';
import { ESTADOS } from './agenda';

export const id = z.number().int().positive();
const texto = (campo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${campo}.`)
    .max(maximo, `${campo[0]?.toUpperCase()}${campo.slice(1)}: máximo ${maximo} caracteres.`);
const textoOpcional = (maximo: number) => z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`).default('');

/** 'AAAA-MM-DD' que además sea una fecha REAL (SQLite no lo controla: '2026-02-31' pasaría). */
export const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.')
  .refine((f) => {
    const [a, m, d] = f.split('-').map(Number) as [number, number, number];
    const fecha = new Date(a, m - 1, d);
    return fecha.getFullYear() === a && fecha.getMonth() === m - 1 && fecha.getDate() === d;
  }, 'Esa fecha no existe.');

export const esquemaHora = z.string().refine(esHora, 'La hora tiene que ser como 08:30.');

/** Solo los números del DNI: "30.123.456" → "30123456". */
export function limpiarDni(dni: string): string {
  return dni.replace(/\D/g, '');
}

// ---------- Profesionales ----------
export const COLORES_PROFESIONAL = ['eucalipto', 'pizarra', 'ciruela', 'ocre', 'coral', 'musgo'] as const;
export const DURACIONES = [10, 15, 20, 30, 40, 45, 60, 90] as const;

export const esquemaFranja = z
  .object({
    diaSemana: z.number().int().min(1).max(7),
    desde: esquemaHora,
    hasta: esquemaHora,
  })
  .refine((f) => aMinutos(f.desde) < aMinutos(f.hasta), { message: 'En cada franja, "desde" tiene que ser antes que "hasta".' });

export const esquemaProfesional = z
  .object({
    id: id.optional(),
    titulo: textoOpcional(10),
    nombre: texto('el nombre', 40),
    apellido: texto('el apellido', 40),
    especialidad: textoOpcional(60),
    matricula: textoOpcional(30),
    color: z.enum(COLORES_PROFESIONAL).default('eucalipto'),
    duracionTurnoMin: z.number().int().min(5, 'El turno dura al menos 5 minutos.').max(240, 'El turno dura como máximo 4 horas.'),
    /** Lo que cobra una consulta particular (se propone al cobrar). 0 = sin precio cargado. */
    precioConsultaCentavos: z.number().int().min(0).max(100_000_000, 'El precio es demasiado alto.').default(0),
    horarios: z.array(esquemaFranja).max(50),
  })
  .superRefine((p, ctx) => {
    // Dos franjas del mismo día no se pueden pisar (09–13 y 12–16).
    for (let dia = 1; dia <= 7; dia++) {
      const delDia = p.horarios.filter((h) => h.diaSemana === dia).sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));
      for (let i = 1; i < delDia.length; i++) {
        if (aMinutos(delDia[i]!.desde) < aMinutos(delDia[i - 1]!.hasta)) {
          ctx.addIssue({ code: 'custom', message: `Hay dos franjas que se pisan el ${NOMBRE_DIA[dia]}.`, path: ['horarios'] });
          return;
        }
      }
    }
  });
export type DatosProfesional = z.input<typeof esquemaProfesional>;

export const NOMBRE_DIA: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

// ---------- Días sin atención ----------
export const esquemaBloqueo = z
  .object({
    profesionalId: id.nullable(), // null = todo la veterinaria
    desde: esquemaFecha,
    hasta: esquemaFecha,
    motivo: textoOpcional(80),
  })
  .refine((b) => b.desde <= b.hasta, { message: '"Hasta" no puede ser antes que "desde".', path: ['hasta'] });
export type DatosBloqueo = z.input<typeof esquemaBloqueo>;

// ---------- Dueños y mascotas ----------
export const ESPECIES = ['perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otro'] as const;
export const NOMBRE_ESPECIE: Record<(typeof ESPECIES)[number], string> = {
  perro: 'Perro',
  gato: 'Gato',
  ave: 'Ave',
  conejo: 'Conejo',
  roedor: 'Roedor',
  reptil: 'Reptil',
  otro: 'Otro',
};
export const SEXOS = ['macho', 'hembra'] as const;

/** Solo los números del chip: "985 112 003 456 789" → "985112003456789". */
export function limpiarMicrochip(chip: string): string {
  return chip.replace(/\D/g, '');
}

export const esquemaDueno = z.object({
  /** Si viene, se actualiza ese dueño; si no, se crea uno nuevo. */
  id: id.optional(),
  nombre: texto('el nombre del dueño', 40),
  apellido: texto('el apellido del dueño', 40),
  dni: z
    .string()
    .trim()
    .default('')
    .transform(limpiarDni)
    .refine((d) => d === '' || (d.length >= 7 && d.length <= 8), 'El DNI tiene que tener 7 u 8 números.'),
  telefono: textoOpcional(30),
  email: z.union([z.literal(''), z.string().trim().email('El email no es válido.').max(80)]).default(''),
  direccion: textoOpcional(80),
  notas: textoOpcional(300),
});
export type DatosDueno = z.input<typeof esquemaDueno>;

export const esquemaMascota = z.object({
  id: id.optional(),
  nombre: texto('el nombre de la mascota', 40),
  especie: z.enum(ESPECIES).default('perro'),
  raza: textoOpcional(40),
  sexo: z.union([z.enum(SEXOS), z.literal('')]).default(''),
  castrado: z.boolean().default(false),
  fechaNacimiento: z.union([esquemaFecha, z.literal('')]).default(''),
  color: textoOpcional(40),
  microchip: z
    .string()
    .trim()
    .default('')
    .transform(limpiarMicrochip)
    .refine((c) => c === '' || (c.length >= 9 && c.length <= 15), 'El microchip tiene que tener entre 9 y 15 números.'),
  notas: textoOpcional(300),
  /** Los datos del dueño viajan junto con la mascota: se guardan en un solo paso. */
  dueno: esquemaDueno,
});
export type DatosMascota = z.input<typeof esquemaMascota>;

export const esquemaBuscarMascotas = z.object({
  texto: z.string().trim().max(60).default(''),
  especie: z.enum(ESPECIES).nullable().default(null),
  incluirBajas: z.boolean().default(false),
});
export type DatosBuscarMascotas = z.input<typeof esquemaBuscarMascotas>;

/** Para elegir un dueño que ya existe (al cargar una mascota nueva de una familia conocida). */
export const esquemaBuscarDuenos = z.object({ texto: z.string().trim().max(60).default('') });
export type DatosBuscarDuenos = z.input<typeof esquemaBuscarDuenos>;

// ---------- Veterinaria ----------
export const esquemaVeterinaria = z.object({
  nombreVeterinaria: texto('el nombre de la veterinaria', 50),
  direccion: textoOpcional(80),
  telefono: textoOpcional(40),
});

export const esquemaMensajeRecordatorio = texto('el mensaje del recordatorio', 600);
export type DatosVeterinaria = z.input<typeof esquemaVeterinaria>;

// ---------- Turnos ----------
export const esquemaEstado = z.enum(ESTADOS);

export const esquemaTurno = z.object({
  profesionalId: id,
  mascotaId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
  /** Si no viene, se usa la duración de turno del profesional. */
  duracionMin: z.number().int().min(5).max(240).optional(),
  motivo: textoOpcional(80),
});
export type DatosTurno = z.input<typeof esquemaTurno>;

/** Reprogramar: otro día, otra hora y/o otro profesional. */
export const esquemaMoverTurno = z.object({
  id,
  profesionalId: id,
  fecha: esquemaFecha,
  desde: esquemaHora,
});
export type DatosMoverTurno = z.input<typeof esquemaMoverTurno>;

const MAXIMO_DIAS_AGENDA = 42;
/** Un rango de días para la agenda (la semana, o un día solo). */
export const esquemaRango = z
  .object({ desde: esquemaFecha, hasta: esquemaFecha })
  .refine((r) => r.desde <= r.hasta, { message: '"Hasta" no puede ser antes que "desde".' })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 < MAXIMO_DIAS_AGENDA, {
    message: `La agenda se pide de a ${MAXIMO_DIAS_AGENDA} días como máximo.`,
  });
export type DatosRango = z.input<typeof esquemaRango>;

// ---------- Consultas (historia clínica) ----------
export const esquemaConsulta = z.object({
  turnoId: id,
  motivo: textoOpcional(120),
  evolucion: texto('la evolución (qué se vio en la consulta)', 4000),
  diagnostico: textoOpcional(200),
  indicaciones: textoOpcional(2000),
  /** Kilos (12,5). Vacío = no se pesó. */
  pesoKg: z
    .number({ error: 'El peso no es válido.' })
    .min(0.05, 'El peso mínimo es 0,05 kg (50 g).')
    .max(150, 'El peso máximo es 150 kg.')
    .nullable()
    .default(null),
  /** Grados (38,5). Vacío = no se tomó. */
  temperaturaC: z
    .number({ error: 'La temperatura no es válida.' })
    .min(30, 'La temperatura tiene que estar entre 30 y 45 °C.')
    .max(45, 'La temperatura tiene que estar entre 30 y 45 °C.')
    .nullable()
    .default(null),
});
export type DatosConsulta = z.input<typeof esquemaConsulta>;

// ---------- Cobros ----------
export const METODOS = ['efectivo', 'transferencia', 'debito', 'credito'] as const;
export const NOMBRE_METODO: Record<(typeof METODOS)[number], string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

export const esquemaCobro = z
  .object({
    turnoId: id,
    /** Lo que paga el dueño por la consulta. */
    montoCentavos: z.number().int().min(1, 'Escribí cuánto paga.').max(100_000_000, 'El importe es demasiado alto.'),
    metodo: z.enum(METODOS, { message: 'Elegí cómo paga.' }),
  });
export type DatosCobro = z.input<typeof esquemaCobro>;

// ---------- Usuarios ----------
export const ROLES = ['admin', 'profesional', 'recepcion'] as const;

export const esquemaPin = z.string().regex(/^\d{4,6}$/, 'El PIN tiene que ser de 4 a 6 números.');

export const esquemaUsuario = z
  .object({
    id: id.optional(),
    nombre: texto('el nombre', 30),
    rol: z.enum(ROLES),
    /** Vincula al usuario con su ficha de profesional (ve la historia clínica). */
    profesionalId: id.nullable().default(null),
    /** Obligatorio al crear; al editar, vacío = no cambiar el PIN. */
    pin: z.union([esquemaPin, z.literal('')]).default(''),
  })
  .superRefine((u, ctx) => {
    if (u.rol === 'profesional' && u.profesionalId === null) {
      ctx.addIssue({ code: 'custom', message: 'Elegí de qué profesional es este usuario.', path: ['profesionalId'] });
    }
  })
  // Recepción nunca queda vinculada a un profesional (no ve la historia clínica)
  .transform((u) => ({ ...u, profesionalId: u.rol === 'recepcion' ? null : u.profesionalId }));
export type DatosUsuario = z.input<typeof esquemaUsuario>;

/** Período de un reporte: hasta un año. */
export const esquemaPeriodo = z
  .object({ desde: esquemaFecha, hasta: esquemaFecha })
  .refine((r) => r.desde <= r.hasta, { message: '"Hasta" no puede ser antes que "desde".' })
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 <= 366, { message: 'El período puede ser de hasta un año.' });
export type DatosPeriodo = z.input<typeof esquemaPeriodo>;
