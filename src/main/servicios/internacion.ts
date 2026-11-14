// Internación: una mascota queda en la veterinaria algunos días, se anota cómo evoluciona
// y al darla de alta se cobran los días. Los días y el total se CALCULAN (no se guardan hasta el alta).
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaAlta, esquemaEvolucion, esquemaIngreso } from '@compartido/esquemas';
import { diasDeInternacion, totalInternacion } from '@compartido/servicios';
import type { EvolucionInternacion, Internacion, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';

type Lector = Pick<BaseDeDatos, '$client'>;

const COLUMNAS = `i.id, i.mascota_id AS mascotaId, m.nombre AS mascota, m.especie, d.apellido || ', ' || d.nombre AS dueno,
  CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.titulo || ' ' || p.nombre || ' ' || p.apellido) END AS profesional,
  i.ingreso, i.lugar, i.motivo, i.tarifa_diaria_centavos AS tarifaDiariaCentavos, i.egreso, i.total_centavos AS cobrado, i.metodo,
  (SELECT e.momento FROM evoluciones_internacion e WHERE e.internacion_id = i.id ORDER BY e.momento DESC, e.id DESC LIMIT 1) AS evMomento,
  (SELECT e.texto FROM evoluciones_internacion e WHERE e.internacion_id = i.id ORDER BY e.momento DESC, e.id DESC LIMIT 1) AS evTexto,
  (SELECT e.temperatura_decimas FROM evoluciones_internacion e WHERE e.internacion_id = i.id ORDER BY e.momento DESC, e.id DESC LIMIT 1) AS evTemp`;
const DESDE = `FROM internaciones i JOIN mascotas m ON m.id = i.mascota_id JOIN duenos d ON d.id = m.dueno_id LEFT JOIN profesionales p ON p.id = i.profesional_id`;

interface Fila extends Omit<Internacion, 'dias' | 'totalCentavos' | 'ultimaEvolucion'> {
  cobrado: number | null;
  evMomento: string | null;
  evTexto: string | null;
  evTemp: number | null;
}

function aInternacion(f: Fila, hoy: string): Internacion {
  const { cobrado, evMomento, evTexto, evTemp, ...resto } = f;
  const dias = diasDeInternacion(f.ingreso, f.egreso ?? hoy);
  return {
    ...resto,
    dias,
    totalCentavos: cobrado ?? totalInternacion(dias, f.tarifaDiariaCentavos),
    ultimaEvolucion: evMomento && evTexto ? { momento: evMomento, texto: evTexto, temperaturaC: evTemp === null ? null : evTemp / 10 } : null,
  };
}

export function obtenerInternacion(db: Lector, id: number, hoy: string = fechaLocal()): Internacion {
  const f = db.$client.prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE i.id = ?`).get(id) as Fila | undefined;
  if (!f) throw new ErrorDeUsuario('Esa internación no existe.');
  return aInternacion(f, hoy);
}

/** Las que están internadas hoy, la que lleva más tiempo primero. */
export function listarInternadas(db: Lector, hoy: string = fechaLocal()): Internacion[] {
  const filas = db.$client.prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE i.egreso IS NULL ORDER BY i.ingreso, i.id`).all() as Fila[];
  return filas.map((f) => aInternacion(f, hoy));
}

/** Las últimas altas (la más nueva primero). */
export function altasRecientes(db: Lector, limite = 12): Internacion[] {
  const filas = db.$client.prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE i.egreso IS NOT NULL ORDER BY i.egreso DESC, i.id DESC LIMIT ?`).all(limite) as Fila[];
  return filas.map((f) => aInternacion(f, f.egreso!));
}

export const cantidadInternadas = (db: Lector): number =>
  (db.$client.prepare('SELECT count(*) AS n FROM internaciones WHERE egreso IS NULL').get() as { n: number }).n;

export function ingresarMascota(db: BaseDeDatos, datos: z.output<typeof esquemaIngreso>, usuario: Pick<Usuario, 'id'> | null, ahora: Date = new Date()): number {
  const m = db.$client.prepare('SELECT nombre, activo FROM mascotas WHERE id = ?').get(datos.mascotaId) as { nombre: string; activo: number } | undefined;
  if (!m) throw new ErrorDeUsuario('Esa mascota no existe.');
  if (!m.activo) throw new ErrorDeUsuario(`${m.nombre} está dada de baja.`);
  const ya = db.$client.prepare('SELECT lugar FROM internaciones WHERE mascota_id = ? AND egreso IS NULL').get(datos.mascotaId) as { lugar: string } | undefined;
  if (ya) throw new ErrorDeUsuario(`${m.nombre} ya está internada${ya.lugar ? ` (${ya.lugar})` : ''}.`);
  if (datos.profesionalId !== null) {
    const p = db.$client.prepare('SELECT activo FROM profesionales WHERE id = ?').get(datos.profesionalId) as { activo: number } | undefined;
    if (!p || !p.activo) throw new ErrorDeUsuario('Ese veterinario no está disponible.');
  }
  return Number(
    db.$client
      .prepare('INSERT INTO internaciones (mascota_id, profesional_id, usuario_id, ingreso, motivo, lugar, tarifa_diaria_centavos, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(datos.mascotaId, datos.profesionalId, usuario?.id ?? null, fechaLocal(ahora), datos.motivo, datos.lugar, datos.tarifaDiariaCentavos, momentoLocal(ahora)).lastInsertRowid,
  );
}

export function evolucionesDe(db: Lector, internacionId: number): EvolucionInternacion[] {
  return (
    db.$client
      .prepare(
        `SELECT e.id, e.momento, e.texto, e.temperatura_decimas AS temp, coalesce(u.nombre, '') AS usuario
         FROM evoluciones_internacion e LEFT JOIN usuarios u ON u.id = e.usuario_id
         WHERE e.internacion_id = ? ORDER BY e.momento DESC, e.id DESC`,
      )
      .all(internacionId) as { id: number; momento: string; texto: string; temp: number | null; usuario: string }[]
  ).map(({ temp, ...e }) => ({ ...e, temperaturaC: temp === null ? null : temp / 10 }));
}

export function agregarEvolucion(db: BaseDeDatos, datos: z.output<typeof esquemaEvolucion>, usuario: Pick<Usuario, 'id'> | null, ahora: Date = new Date()): number {
  const i = db.$client.prepare('SELECT egreso FROM internaciones WHERE id = ?').get(datos.internacionId) as { egreso: string | null } | undefined;
  if (!i) throw new ErrorDeUsuario('Esa internación no existe.');
  if (i.egreso) throw new ErrorDeUsuario('Esa mascota ya fue dada de alta: no se pueden agregar más notas.');
  const decimas = datos.temperaturaC === null ? null : Math.round(datos.temperaturaC * 10);
  return Number(
    db.$client
      .prepare('INSERT INTO evoluciones_internacion (internacion_id, momento, texto, temperatura_decimas, usuario_id) VALUES (?, ?, ?, ?, ?)')
      .run(datos.internacionId, momentoLocal(ahora), datos.texto, decimas, usuario?.id ?? null).lastInsertRowid,
  );
}

/** Da el alta y cobra los días. Si no hay nada para cobrar (tarifa 0), no hace falta el medio de pago. */
export function darAlta(db: BaseDeDatos, datos: z.output<typeof esquemaAlta>, ahora: Date = new Date()): number {
  const hoy = fechaLocal(ahora);
  const i = obtenerInternacion(db, datos.internacionId, hoy);
  if (i.egreso) throw new ErrorDeUsuario(`${i.mascota} ya fue dada de alta.`);
  if (i.totalCentavos > 0 && !datos.metodo) throw new ErrorDeUsuario('Elegí cómo paga.');
  const metodo = i.totalCentavos > 0 ? datos.metodo : null;
  db.$client.prepare('UPDATE internaciones SET egreso = ?, total_centavos = ?, metodo = ? WHERE id = ?').run(hoy, i.totalCentavos, metodo, i.id);
  return i.totalCentavos;
}
