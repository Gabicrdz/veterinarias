// Tipos que comparten el main y la ventana (lo que VUELVE del main).
import type { COLORES_PROFESIONAL, ESPECIES, METODOS, ROLES, SEXOS } from './esquemas';
import type { Franja } from './horarios';
import type { EstadoTurno } from './agenda';
import type { EstadoDosis, TipoAplicacion } from './vacunas';
import type { CategoriaProducto, EstadoStock, TipoMovimiento, Unidad } from './productos';

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };

export type ColorProfesional = (typeof COLORES_PROFESIONAL)[number];

export interface Profesional {
  id: number;
  titulo: string;
  nombre: string;
  apellido: string;
  especialidad: string;
  matricula: string;
  color: ColorProfesional;
  duracionTurnoMin: number;
  precioConsultaCentavos: number;
  activo: boolean;
  horarios: Franja[];
}

export interface Bloqueo {
  id: number;
  profesionalId: number | null;
  /** "Toda la veterinaria" o el nombre del profesional. */
  quien: string;
  desde: string;
  hasta: string;
  motivo: string;
}

export type Especie = (typeof ESPECIES)[number];
export type Sexo = (typeof SEXOS)[number];

export interface Dueno {
  id: number;
  nombre: string;
  apellido: string;
  dni: string | null;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  activo: boolean;
}

export interface Mascota {
  id: number;
  nombre: string;
  especie: Especie;
  raza: string;
  sexo: Sexo | null;
  castrado: boolean;
  fechaNacimiento: string | null;
  color: string;
  microchip: string | null;
  notas: string;
  activo: boolean;
  /** Los datos del dueño, para mostrar la mascota sin pedir otra vez. */
  dueno: Dueno;
}

export interface Veterinaria {
  nombreVeterinaria: string;
  direccion: string;
  telefono: string;
  mensajeRecordatorio: string;
  mensajeVacuna: string;
}

export interface Resumen {
  mascotas: number;
  profesionales: number;
  /** Todos los turnos cargados (para saber si la agenda está vacía). */
  turnos: number;
}

export interface InfoSistema {
  version: string;
  baseDeDatos: string;
}

export interface Turno {
  id: number;
  profesionalId: number;
  mascotaId: number;
  fecha: string;
  desde: string;
  hasta: string;
  estado: EstadoTurno;
  motivo: string;
  llegoEn: string | null;
  recordadoEn: string | null;
  /** Quién dio el turno (null si se cargó antes de que hubiera usuarios) y cuándo. */
  dadoPor: string | null;
  creadoEn: string;
  /** El cobro vigente del turno, si ya se cobró. */
  cobro: CobroDeTurno | null;
  /** Si ya tiene las notas de la consulta. */
  consultaId: number | null;
  /** Nombre de la mascota. */
  mascota: string;
  especie: Especie;
  raza: string;
  fechaNacimiento: string | null;
  notasMascota: string;
  mascotaActivo: boolean;
  duenoId: number;
  /** "Apellido, Nombre" del dueño. */
  dueno: string;
  /** Teléfono del dueño (para el recordatorio). */
  telefono: string;
}

export type MetodoPago = (typeof METODOS)[number];

export interface CobroDeTurno {
  id: number;
  montoCentavos: number;
  metodo: MetodoPago | null;
  /** Quién cobró y cuándo. */
  usuario: string | null;
  creadoEn: string;
}

/** Una entrada de la historia clínica. */
export interface Consulta {
  id: number;
  turnoId: number;
  fecha: string;
  profesional: string;
  profesionalId: number;
  motivo: string;
  evolucion: string;
  diagnostico: string;
  indicaciones: string;
  /** Kilos, o null si no se pesó. */
  pesoKg: number | null;
  /** Grados, o null si no se tomó. */
  temperaturaC: number | null;
  /** Solo se puede corregir el mismo día; después queda cerrada. */
  editable: boolean;
}

/** Lo que necesita la agenda para un rango de días. */
export interface Agenda {
  turnos: Turno[];
  bloqueos: Bloqueo[];
}

export interface HorarioLibre {
  fecha: string;
  desde: string;
}

/** Un turno visto desde la ficha de la mascota. */
export interface TurnoDeMascota {
  id: number;
  fecha: string;
  desde: string;
  estado: EstadoTurno;
  profesional: string;
  color: ColorProfesional;
}

export interface TurnosDeMascota {
  proximos: TurnoDeMascota[];
  anteriores: TurnoDeMascota[];
}

export interface BloqueoCreado {
  id: number;
  /** Turnos que ya estaban dados en esos días (hay que avisarles a las mascotas). */
  turnosAfectados: number;
}

export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  profesional: 'Veterinario',
  recepcion: 'Recepción',
};

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
  /** Si está vinculado a un profesional: ve la historia clínica y carga las notas de sus turnos. */
  profesionalId: number | null;
}

/** Lo que devuelve "Cargar datos de ejemplo": los conteos y los usuarios creados con su PIN. */
export interface ResultadoEjemplo extends Resumen {
  usuarios: { nombre: string; rol: Rol; pin: string }[];
}

// ---------- Reportes (etapa 5) ----------
export interface Reporte {
  desde: string;
  hasta: string;
  totales: {
    turnos: number;
    atendidos: number;
    ausentes: number;
    cancelados: number;
    /** ausentes / (atendidos + ausentes); null si todavía no hay turnos resueltos */
    ausentismo: number | null;
    ingresosCentavos: number;
    porMetodo: { metodo: MetodoPago; centavos: number; cantidad: number }[];
    atendidosSinCobrar: number;
    mascotasAtendidos: number;
    /** Mascotas cuya PRIMERA atención fue en el período */
    mascotasNuevos: number;
  };
  porProfesional: {
    profesionalId: number;
    nombre: string;
    color: ColorProfesional;
    turnos: number;
    atendidos: number;
    ausentes: number;
    ausentismo: number | null;
    /** Turnos que entraban según su horario (sin días sin atención) */
    disponibles: number;
    /** turnos dados (no cancelados) / disponibles */
    ocupacion: number | null;
    ingresosCentavos: number;
  }[];
  /** Atenciones por especie (cada animal atendido en el período). */
  porEspecie: { especie: Especie; atenciones: number; montoCentavos: number }[];
  porDia: { fecha: string; atendidos: number; ausentes: number; ingresosCentavos: number }[];
  /** Ventas del mostrador (productos) del período, sin contar las anuladas. */
  productos: {
    ventas: number;
    totalCentavos: number;
    /** Lo vendido menos lo que costaba. */
    gananciaCentavos: number;
    masVendidos: { productoId: number; nombre: string; unidad: Unidad; cantidadMilesimas: number; totalCentavos: number }[];
  };
  /** Mascotas con 2 o más ausencias en el período */
  faltadores: { mascotaId: number; mascota: string; dueno: string; telefono: string; ausentes: number; turnos: number }[];
}

// ---------- Copias de seguridad (etapa 5) ----------
export interface InfoCopia {
  ruta: string;
  nombre: string;
  /** 'AAAA-MM-DD HH:MM' */
  fecha: string;
  bytes: number;
}
export interface EstadoCopias {
  carpeta: string;
  automaticas: InfoCopia[];
  baseDeDatos: string;
}
/** Lo que se encontró en la copia elegida, para confirmar antes de restaurar. */
export interface CopiaElegida {
  nombre: string;
  descripcion: string;
}

// ---------- Vacunas y desparasitaciones ----------
/** Una aplicación del carnet de la mascota. */
export interface Aplicacion {
  id: number;
  mascotaId: number;
  tipo: TipoAplicacion;
  nombre: string;
  fecha: string;
  proximaDosis: string | null;
  lote: string;
  notas: string;
  /** Quién la registró (veterinario o recepción), si se sabe. */
  registradoPor: string;
  /** Si ya se avisó al dueño de la próxima dosis (momento del aviso). */
  avisadoEn: string | null;
  /** Si ya se aplicó una más nueva del mismo nombre: esta dosis ya se cumplió. */
  renovada: boolean;
}

/** Una dosis que toca (o ya pasó): lo que ve la pantalla Vacunas. */
export interface DosisPendiente {
  aplicacionId: number;
  mascotaId: number;
  mascota: string;
  especie: Especie;
  dueno: string;
  telefono: string;
  /** El teléfono sirve para WhatsApp (es un celular con código de área). */
  tieneWhatsApp: boolean;
  tipo: TipoAplicacion;
  nombre: string;
  /** Cuándo se aplicó la anterior. */
  aplicadaEl: string;
  proximaDosis: string;
  /** Negativo = ya pasó hace tantos días. */
  dias: number;
  estado: EstadoDosis;
  avisadoEn: string | null;
}

// ---------- Productos, stock y ventas del mostrador ----------
export interface Producto {
  id: number;
  codigo: string | null;
  nombre: string;
  categoria: CategoriaProducto;
  unidad: Unidad;
  costoCentavos: number;
  precioCentavos: number;
  /** Cantidades en milésimas (1 unidad = 1000). */
  stockMinimoMilesimas: number;
  stockMilesimas: number;
  estado: EstadoStock;
  activo: boolean;
}

export interface MovimientoStock {
  id: number;
  tipo: TipoMovimiento;
  /** Con signo: positivo entra, negativo sale. */
  cantidadMilesimas: number;
  costoCentavos: number | null;
  motivo: string;
  fecha: string;
  ventaId: number | null;
  usuario: string;
}

export interface ItemDeVenta {
  productoId: number;
  nombre: string;
  unidad: Unidad;
  cantidadMilesimas: number;
  precioCentavos: number;
  subtotalCentavos: number;
}

export interface Venta {
  id: number;
  fecha: string;
  /** Hora de la venta, "HH:MM". */
  hora: string;
  totalCentavos: number;
  metodo: MetodoPago;
  usuario: string;
  anulada: boolean;
  items: ItemDeVenta[];
}

/** Lo que muestra el mostrador de un día: las ventas y los totales (sin contar las anuladas). */
export interface VentasDelDia {
  fecha: string;
  ventas: Venta[];
  totalCentavos: number;
  cantidad: number;
  porMetodo: { metodo: MetodoPago; centavos: number }[];
}
