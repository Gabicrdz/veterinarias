// Las tablas, descriptas para Drizzle (consultas con tipos). La estructura
// REAL la crean las migraciones; una prueba revisa que ambas coincidan.
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const ahora = sql`(datetime('now', 'localtime'))`;

export const configuracion = sqliteTable('configuracion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});

export const profesionales = sqliteTable('profesionales', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  apellido: text('apellido').notNull(),
  titulo: text('titulo').notNull().default(''),
  especialidad: text('especialidad').notNull().default(''),
  matricula: text('matricula').notNull().default(''),
  color: text('color').notNull().default('eucalipto'),
  duracionTurnoMin: integer('duracion_turno_min').notNull().default(30),
  precioConsultaCentavos: integer('precio_consulta_centavos').notNull().default(0),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const horarios = sqliteTable('horarios', {
  id: integer('id').primaryKey(),
  profesionalId: integer('profesional_id')
    .notNull()
    .references(() => profesionales.id, { onDelete: 'cascade' }),
  diaSemana: integer('dia_semana').notNull(),
  desde: text('desde').notNull(),
  hasta: text('hasta').notNull(),
});

export const bloqueos = sqliteTable('bloqueos', {
  id: integer('id').primaryKey(),
  profesionalId: integer('profesional_id').references(() => profesionales.id, { onDelete: 'cascade' }),
  desde: text('desde').notNull(),
  hasta: text('hasta').notNull(),
  motivo: text('motivo').notNull().default(''),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const duenos = sqliteTable('duenos', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  apellido: text('apellido').notNull(),
  dni: text('dni'),
  telefono: text('telefono').notNull().default(''),
  email: text('email').notNull().default(''),
  direccion: text('direccion').notNull().default(''),
  notas: text('notas').notNull().default(''),
  busqueda: text('busqueda').notNull().default(''),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const mascotas = sqliteTable('mascotas', {
  id: integer('id').primaryKey(),
  duenoId: integer('dueno_id')
    .notNull()
    .references(() => duenos.id),
  nombre: text('nombre').notNull(),
  especie: text('especie', { enum: ['perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otro'] }).notNull().default('perro'),
  raza: text('raza').notNull().default(''),
  sexo: text('sexo', { enum: ['macho', 'hembra'] }),
  castrado: integer('castrado', { mode: 'boolean' }).notNull().default(false),
  fechaNacimiento: text('fecha_nacimiento'),
  color: text('color').notNull().default(''),
  microchip: text('microchip'),
  notas: text('notas').notNull().default(''),
  busqueda: text('busqueda').notNull().default(''),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const turnos = sqliteTable('turnos', {
  id: integer('id').primaryKey(),
  profesionalId: integer('profesional_id')
    .notNull()
    .references(() => profesionales.id),
  mascotaId: integer('mascota_id')
    .notNull()
    .references(() => mascotas.id),
  fecha: text('fecha').notNull(),
  desde: text('desde').notNull(),
  hasta: text('hasta').notNull(),
  estado: text('estado').notNull().default('reservado'),
  motivo: text('motivo').notNull().default(''),
  llegoEn: text('llego_en'),
  recordadoEn: text('recordado_en'),
  dadoPor: integer('dado_por').references(() => usuarios.id),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const consultas = sqliteTable('consultas', {
  id: integer('id').primaryKey(),
  turnoId: integer('turno_id')
    .notNull()
    .references(() => turnos.id),
  mascotaId: integer('mascota_id')
    .notNull()
    .references(() => mascotas.id),
  profesionalId: integer('profesional_id')
    .notNull()
    .references(() => profesionales.id),
  fecha: text('fecha').notNull(),
  motivo: text('motivo').notNull().default(''),
  evolucion: text('evolucion').notNull(),
  diagnostico: text('diagnostico').notNull().default(''),
  indicaciones: text('indicaciones').notNull().default(''),
  pesoGramos: integer('peso_gramos'),
  temperaturaDecimas: integer('temperatura_decimas'),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const cobros = sqliteTable('cobros', {
  id: integer('id').primaryKey(),
  turnoId: integer('turno_id')
    .notNull()
    .references(() => turnos.id),
  montoCentavos: integer('monto_centavos').notNull().default(0),
  metodo: text('metodo'),
  anulado: integer('anulado', { mode: 'boolean' }).notNull().default(false),
  anuladoEn: text('anulado_en'),
  creadoEn: text('creado_en').notNull().default(ahora),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
});

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rol: text('rol', { enum: ['admin', 'recepcion', 'profesional'] }).notNull(),
  profesionalId: integer('profesional_id').references(() => profesionales.id),
  pinHash: text('pin_hash').notNull(),
  pinSal: text('pin_sal').notNull(),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});
