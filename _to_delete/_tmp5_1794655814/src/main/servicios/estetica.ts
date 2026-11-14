// Baños y peluquería: un tablero de lo que se está haciendo hoy. Cada servicio avanza
// esperando → en proceso → listo → entregado (acá se cobra). Cuando está listo se le avisa al dueño por WhatsApp.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaCambioEstetica, esquemaServicioEstetica } from '@compartido/esquemas';
import { NOMBRE_ESTETICA, SIGUIENTE_ESTETICA, TIPOS_ESTETICA, sePuedeCancelar, type EstadoEstetica, type TipoEstetica } from '@compartido/servicios';
import type { ServicioEstetica, TableroEstetica, Usuario } from '@compartido/tipos';
import { armarMensajeListo, enlaceWhatsApp, numeroWhatsApp } from '@compartido/whatsapp';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { obtenerVeterinaria } from './veterinaria';

type Lector = Pick<BaseDeDatos, '$client'>;

const SELECT = `SELECT s.id, s.mascota_id AS mascotaId, m.nombre AS mascota, m.especie, d.apellido || ', ' || d.nombre AS dueno, d.telefono,
  s.fecha, s.tipo, s.precio_centavos AS precioCentavos, s.estado, s.notas, s.metodo, s.avisado_en AS avisadoEn, s.entregado_en AS entregadoEn
  FROM servicios_estetica s JOIN mascotas m ON m.id = s.mascota_id JOIN duenos d ON d.id = m.dueno_id`;

type Fila = Omit<ServicioEstetica, 'avisado' | 'tieneWhatsApp'> & { telefono: string; avisadoEn: string | null; entregadoEn: string | null };

function aServicio({ telefono, avisadoEn, entregadoEn: _e, ...f }: Fila): ServicioEstetica {
  return { ...f, avisado: avisadoEn !== null, tieneWhatsApp: numeroWhatsApp(telefono) !== null };
}

export function tablero(db: Lector, hoy: string = fechaLocal()): TableroEstetica {
  const c = db.$client;
  const orden = `ORDER BY CASE s.estado WHEN 'listo' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END, s.fecha, s.id`;
  const activos = (c.prepare(`${SELECT} WHERE s.estado IN ('esperando', 'en_proceso', 'listo') AND s.fecha <= ? ${orden}`).all(hoy) as Fila[]).map(aServicio);
  const proximos = (c.prepare(`${SELECT} WHERE s.estado = 'esperando' AND s.fecha > ? ORDER BY s.fecha, s.id`).all(hoy) as Fila[]).map(aServicio);
  const entregados = (c.prepare(`${SELECT} WHERE s.estado = 'entregado' AND substr(s.entregado_en, 1, 10) = ? ORDER BY s.entregado_en DESC`).all(hoy) as Fila[]).map(aServicio);
  return { hoy, activos, proximos, entregadosHoy: entregados, cobradoHoyCentavos: entregados.reduce((s, x) => s + x.precioCentavos, 0) };
}

export function crearServicio(db: BaseDeDatos, datos: z.output<typeof esquemaServicioEstetica>, usuario: Pick<Usuario, 'id'> | null, ahora: Date = new Date()): number {
  const m = db.$client.prepare('SELECT nombre, activo FROM mascotas WHERE id = ?').get(datos.mascotaId) as { nombre: string; activo: number } | undefined;
  if (!m) throw new ErrorDeUsuario('Esa mascota no existe.');
  if (!m.activo) throw new ErrorDeUsuario(`${m.nombre} está dada de baja.`);
  if (datos.fecha < fechaLocal(ahora)) throw new ErrorDeUsuario('La fecha no puede ser anterior a hoy.');
  return Number(
    db.$client
      .prepare('INSERT INTO servicios_estetica (mascota_id, fecha, tipo, precio_centavos, notas, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(datos.mascotaId, datos.fecha, datos.tipo, datos.precioCentavos, datos.notas, usuario?.id ?? null, momentoLocal(ahora)).lastInsertRowid,
  );
}

/** Mueve el servicio al estado pedido: solo se puede avanzar un paso o cancelar. */
export function cambiarEstadoServicio(db: BaseDeDatos, datos: z.output<typeof esquemaCambioEstetica>, ahora: Date = new Date()): void {
  const s = db.$client.prepare('SELECT estado, precio_centavos AS precio FROM servicios_estetica WHERE id = ?').get(datos.id) as { estado: EstadoEstetica; precio: number } | undefined;
  if (!s) throw new ErrorDeUsuario('Ese servicio no existe.');
  if (datos.estado === 'cancelado') {
    if (!sePuedeCancelar(s.estado)) throw new ErrorDeUsuario('Ese servicio ya terminó: no se puede cancelar.');
    db.$client.prepare(`UPDATE servicios_estetica SET estado = 'cancelado' WHERE id = ?`).run(datos.id);
    return;
  }
  if (SIGUIENTE_ESTETICA[s.estado] !== datos.estado) throw new ErrorDeUsuario('Ese servicio no puede pasar a ese estado.');
  if (datos.estado === 'entregado') {
    if (s.precio > 0 && !datos.metodo) throw new ErrorDeUsuario('Elegí cómo paga.');
    db.$client
      .prepare(`UPDATE servicios_estetica SET estado = 'entregado', metodo = ?, entregado_en = ? WHERE id = ?`)
      .run(s.precio > 0 ? datos.metodo : null, momentoLocal(ahora), datos.id);
    return;
  }
  db.$client.prepare('UPDATE servicios_estetica SET estado = ? WHERE id = ?').run(datos.estado, datos.id);
}

/** El enlace de WhatsApp con el aviso "ya está lista" (no escribe nada en la base). */
export function enlaceListo(db: Lector, id: number): string {
  const f = db.$client
    .prepare(`${SELECT} WHERE s.id = ?`)
    .get(id) as (Fila & { nombre?: string }) | undefined;
  if (!f) throw new ErrorDeUsuario('Ese servicio no existe.');
  if (f.estado !== 'listo') throw new ErrorDeUsuario('Solo se avisa cuando la mascota está lista para retirar.');
  const d = db.$client
    .prepare('SELECT d.nombre, d.apellido FROM mascotas m JOIN duenos d ON d.id = m.dueno_id WHERE m.id = ?')
    .get(f.mascotaId) as { nombre: string; apellido: string };
  if (!f.telefono.trim()) throw new ErrorDeUsuario(`El dueño de ${f.mascota} no tiene teléfono cargado. Agregalo en la ficha de la mascota.`);
  const numero = numeroWhatsApp(f.telefono);
  if (!numero) throw new ErrorDeUsuario(`El teléfono del dueño de ${f.mascota} (${f.telefono}) no parece un celular con código de área. Revisalo en la ficha.`);
  const v = obtenerVeterinaria(db);
  return enlaceWhatsApp(
    numero,
    armarMensajeListo(v.mensajeListo, { nombre: d.nombre, apellido: d.apellido, mascota: f.mascota, servicio: NOMBRE_ESTETICA[f.tipo], veterinaria: v.nombreVeterinaria, direccion: v.direccion }),
  );
}

export function marcarAvisadoListo(db: Lector, id: number, ahora: Date = new Date()): void {
  db.$client.prepare('UPDATE servicios_estetica SET avisado_en = ? WHERE id = ?').run(momentoLocal(ahora), id);
}

/** El último precio cobrado de cada servicio: el diálogo lo propone para no tener que escribirlo siempre. */
export function ultimosPrecios(db: Lector): Partial<Record<TipoEstetica, number>> {
  const r: Partial<Record<TipoEstetica, number>> = {};
  const q = db.$client.prepare(`SELECT precio_centavos AS p FROM servicios_estetica WHERE tipo = ? AND estado <> 'cancelado' ORDER BY id DESC LIMIT 1`);
  for (const t of TIPOS_ESTETICA) {
    const f = q.get(t) as { p: number } | undefined;
    if (f) r[t] = f.p;
  }
  return r;
}
