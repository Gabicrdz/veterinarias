// Vacunas y desparasitaciones: el carnet de cada mascota y el aviso de próxima dosis.
//
// Idea central: una dosis "toca" mientras NO se haya aplicado otra más nueva de lo
// mismo. Esto no se guarda en ningún lado, se calcula en la consulta: así, cuando
// se registra la aplicación siguiente, la dosis anterior deja de aparecer sola
// (y no hay un estado "cumplida" que alguien se pueda olvidar de actualizar).
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaAplicacion, esquemaPendientes } from '@compartido/esquemas';
import { diasEntre, estadoDeDosis, type TipoAplicacion } from '@compartido/vacunas';
import { armarMensajeVacuna, enlaceWhatsApp, numeroWhatsApp } from '@compartido/whatsapp';
import type { Aplicacion, DosisPendiente, Especie, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { normalizar } from './texto';
import { obtenerVeterinaria } from './veterinaria';

type Lector = Pick<BaseDeDatos, '$client'>;

const dmaa = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;

// Hay una aplicación más nueva (misma mascota, mismo nombre) que reemplaza a "a"
const RENOVADA = `EXISTS (
  SELECT 1 FROM aplicaciones b
  WHERE b.mascota_id = a.mascota_id AND b.clave = a.clave AND b.anulado = 0 AND b.id <> a.id
    AND (b.fecha > a.fecha OR (b.fecha = a.fecha AND b.id > a.id))
)`;

/** El carnet: todas las aplicaciones vigentes de la mascota, de la más nueva a la más vieja. */
export function carnetDeMascota(db: Lector, mascotaId: number): Aplicacion[] {
  const filas = db.$client
    .prepare(
      `SELECT a.id, a.mascota_id AS mascotaId, a.tipo, a.nombre, a.fecha, a.proxima_dosis AS proximaDosis,
              a.lote, a.notas, a.avisado_en AS avisadoEn, ${RENOVADA} AS renovada,
              COALESCE(u.nombre, '') AS registradoPor
       FROM aplicaciones a LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.mascota_id = ? AND a.anulado = 0
       ORDER BY a.fecha DESC, a.id DESC`,
    )
    .all(mascotaId) as (Omit<Aplicacion, 'renovada'> & { renovada: number })[];
  return filas.map((f) => ({ ...f, renovada: f.renovada === 1 }));
}

export function registrarAplicacion(
  db: BaseDeDatos,
  datos: z.output<typeof esquemaAplicacion>,
  usuario: Pick<Usuario, 'id' | 'profesionalId'>,
  ahora: Date = new Date(),
): number {
  const m = db.$client.prepare('SELECT nombre, activo, fecha_nacimiento AS nacimiento FROM mascotas WHERE id = ?').get(datos.mascotaId) as
    | { nombre: string; activo: number; nacimiento: string | null }
    | undefined;
  if (!m) throw new ErrorDeUsuario('Esa mascota no existe.');
  if (!m.activo) throw new ErrorDeUsuario(`${m.nombre} está dado de baja. Reactivalo en Mascotas para cargarle vacunas.`);
  if (datos.fecha > fechaLocal(ahora)) throw new ErrorDeUsuario('La fecha de aplicación no puede ser futura: la próxima dosis va en "Próxima dosis".');
  if (m.nacimiento && datos.fecha < m.nacimiento) throw new ErrorDeUsuario(`${m.nombre} nació el ${dmaa(m.nacimiento)}: no pudo recibir algo antes.`);

  const clave = normalizar(datos.nombre).replace(/\s+/g, ' ');
  // Dos veces lo mismo el mismo día casi seguro es un doble clic o una carga repetida
  const repetida = db.$client
    .prepare('SELECT 1 FROM aplicaciones WHERE mascota_id = ? AND clave = ? AND fecha = ? AND anulado = 0')
    .get(datos.mascotaId, clave, datos.fecha);
  if (repetida) throw new ErrorDeUsuario(`${datos.nombre} ya está cargada el ${dmaa(datos.fecha)} para ${m.nombre}.`);

  return Number(
    db.$client
      .prepare(
        `INSERT INTO aplicaciones (mascota_id, tipo, nombre, clave, fecha, proxima_dosis, lote, notas, profesional_id, usuario_id, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(datos.mascotaId, datos.tipo, datos.nombre, clave, datos.fecha, datos.proximaDosis, datos.lote, datos.notas, usuario.profesionalId, usuario.id, momentoLocal(ahora)).lastInsertRowid,
  );
}

/** Se anula, no se borra (queda el rastro, como en los cobros). */
export function anularAplicacion(db: BaseDeDatos, id: number, ahora: Date = new Date()): void {
  const a = db.$client.prepare('SELECT anulado FROM aplicaciones WHERE id = ?').get(id) as { anulado: number } | undefined;
  if (!a) throw new ErrorDeUsuario('Esa aplicación no existe.');
  if (a.anulado) throw new ErrorDeUsuario('Esa aplicación ya estaba anulada.');
  db.$client.prepare('UPDATE aplicaciones SET anulado = 1, anulado_en = ? WHERE id = ?').run(momentoLocal(ahora), id);
}

/**
 * Las dosis que ya pasaron o que tocan en los próximos días, de mascotas activas,
 * de la más urgente a la menos urgente.
 */
export function dosisPendientes(db: Lector, filtro: z.output<typeof esquemaPendientes>, ahora: Date = new Date()): DosisPendiente[] {
  const hoy = fechaLocal(ahora);
  const limite = fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + filtro.dentroDeDias));
  const filas = db.$client
    .prepare(
      `SELECT a.id AS aplicacionId, m.id AS mascotaId, m.nombre AS mascota, m.especie,
              trim(d.apellido || ', ' || d.nombre) AS dueno, d.telefono,
              a.tipo, a.nombre, a.fecha AS aplicadaEl, a.proxima_dosis AS proximaDosis, a.avisado_en AS avisadoEn
       FROM aplicaciones a
       JOIN mascotas m ON m.id = a.mascota_id
       JOIN duenos d ON d.id = m.dueno_id
       WHERE a.anulado = 0 AND m.activo = 1 AND a.proxima_dosis IS NOT NULL AND a.proxima_dosis <= ?
         AND NOT ${RENOVADA}
       ORDER BY a.proxima_dosis, m.nombre COLLATE NOCASE, a.id`,
    )
    .all(limite) as { aplicacionId: number; mascotaId: number; mascota: string; especie: Especie; dueno: string; telefono: string; tipo: TipoAplicacion; nombre: string; aplicadaEl: string; proximaDosis: string; avisadoEn: string | null }[];
  return filas.map((f) => ({
    ...f,
    tieneWhatsApp: numeroWhatsApp(f.telefono) !== null,
    dias: diasEntre(hoy, f.proximaDosis),
    estado: estadoDeDosis(f.proximaDosis, hoy),
  }));
}

/** Cuántas dosis ya están vencidas (para el número al lado de "Vacunas" en el menú). */
export function cantidadVencidas(db: Lector, ahora: Date = new Date()): number {
  return dosisPendientes(db, { dentroDeDias: 0 }, ahora).filter((d) => d.estado === 'vencida').length;
}

/** El enlace de WhatsApp con el aviso ya escrito (no escribe nada en la base). */
export function enlaceAviso(db: Lector, aplicacionId: number): string {
  const f = db.$client
    .prepare(
      `SELECT a.nombre AS vacuna, a.proxima_dosis AS proxima, a.anulado, ${RENOVADA} AS renovada,
              m.nombre AS mascota, m.activo, d.nombre, d.apellido, d.telefono
       FROM aplicaciones a JOIN mascotas m ON m.id = a.mascota_id JOIN duenos d ON d.id = m.dueno_id
       WHERE a.id = ?`,
    )
    .get(aplicacionId) as
    | { vacuna: string; proxima: string | null; anulado: number; renovada: number; mascota: string; activo: number; nombre: string; apellido: string; telefono: string }
    | undefined;
  if (!f || f.anulado) throw new ErrorDeUsuario('Esa aplicación no existe.');
  if (!f.proxima) throw new ErrorDeUsuario('Esa aplicación no tiene próxima dosis.');
  if (f.renovada) throw new ErrorDeUsuario(`${f.mascota} ya recibió una ${f.vacuna} más nueva: no hace falta avisar.`);
  if (!f.activo) throw new ErrorDeUsuario(`${f.mascota} está dado de baja.`);
  if (!f.telefono.trim()) throw new ErrorDeUsuario(`El dueño de ${f.mascota} no tiene teléfono cargado. Agregalo en la ficha de la mascota.`);
  const numero = numeroWhatsApp(f.telefono);
  if (!numero) throw new ErrorDeUsuario(`El teléfono del dueño de ${f.mascota} (${f.telefono}) no parece un celular con código de área. Revisalo en la ficha.`);

  const veterinaria = obtenerVeterinaria(db);
  const mensaje = armarMensajeVacuna(veterinaria.mensajeVacuna, {
    nombre: f.nombre,
    apellido: f.apellido,
    mascota: f.mascota,
    vacuna: f.vacuna,
    fecha: dmaa(f.proxima),
    veterinaria: veterinaria.nombreVeterinaria,
    direccion: veterinaria.direccion,
  });
  return enlaceWhatsApp(numero, mensaje);
}

export function marcarAvisado(db: Lector, aplicacionId: number, ahora: Date = new Date()): void {
  db.$client.prepare('UPDATE aplicaciones SET avisado_en = ? WHERE id = ?').run(momentoLocal(ahora), aplicacionId);
}
