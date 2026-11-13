// Dueños y mascotas. La mascota es quien se atiende (turnos, historia clínica);
// el dueño es quien la trae, paga y recibe los avisos por WhatsApp.
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { duenos, mascotas } from '../db/esquema';
import type { esquemaBuscarDuenos, esquemaBuscarMascotas, esquemaDueno, esquemaMascota } from '@compartido/esquemas';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { Dueno, Especie, Mascota, Sexo } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { momentoLocal } from './fechas';
import { escaparLike, normalizar } from './texto';

export const MAXIMO_RESULTADOS = 300;

/** Texto para buscar un dueño: apellido, nombre, DNI y teléfono, sin tildes. */
export function textoDeBusquedaDueno(d: { apellido: string; nombre: string; dni: string | null; telefono: string }): string {
  return normalizar(`${d.apellido} ${d.nombre} ${d.dni ?? ''} ${d.telefono.replace(/\D/g, '')}`);
}

/** Texto para buscar una mascota: nombre, especie, raza y microchip, sin tildes. */
export function textoDeBusquedaMascota(m: { nombre: string; especie: Especie; raza: string; microchip: string | null }): string {
  return normalizar(`${m.nombre} ${NOMBRE_ESPECIE[m.especie]} ${m.raza} ${m.microchip ?? ''}`);
}

const SELECT = /* sql */ `
  SELECT m.id, m.nombre, m.especie, m.raza, m.sexo, m.castrado, m.fecha_nacimiento AS fechaNacimiento, m.color, m.microchip,
         m.notas, m.activo,
         d.id AS duenoId, d.nombre AS duenoNombre, d.apellido AS duenoApellido, d.dni AS duenoDni, d.telefono AS duenoTelefono,
         d.email AS duenoEmail, d.direccion AS duenoDireccion, d.notas AS duenoNotas, d.activo AS duenoActivo
  FROM mascotas m JOIN duenos d ON d.id = m.dueno_id`;

interface FilaMascota {
  id: number;
  nombre: string;
  especie: Especie;
  raza: string;
  sexo: Sexo | null;
  castrado: number;
  fechaNacimiento: string | null;
  color: string;
  microchip: string | null;
  notas: string;
  activo: number;
  duenoId: number;
  duenoNombre: string;
  duenoApellido: string;
  duenoDni: string | null;
  duenoTelefono: string;
  duenoEmail: string;
  duenoDireccion: string;
  duenoNotas: string;
  duenoActivo: number;
}

const aMascota = (f: FilaMascota): Mascota => ({
  id: f.id,
  nombre: f.nombre,
  especie: f.especie,
  raza: f.raza,
  sexo: f.sexo,
  castrado: f.castrado === 1,
  fechaNacimiento: f.fechaNacimiento,
  color: f.color,
  microchip: f.microchip,
  notas: f.notas,
  activo: f.activo === 1,
  dueno: {
    id: f.duenoId,
    nombre: f.duenoNombre,
    apellido: f.duenoApellido,
    dni: f.duenoDni,
    telefono: f.duenoTelefono,
    email: f.duenoEmail,
    direccion: f.duenoDireccion,
    notas: f.duenoNotas,
    activo: f.duenoActivo === 1,
  },
});

/** Una palabra con números ("30.123.456") se busca sin puntos ni guiones. */
const terminoDeBusqueda = (palabra: string) => (/^[\d.\-\s]+$/.test(palabra) ? palabra.replace(/\D/g, '') : palabra);

/**
 * Busca por cada palabra escrita (todas tienen que aparecer, en cualquier orden)
 * entre los datos de la mascota Y de su dueño: "firulais perez" o "gato 3704".
 * Ordena por nombre de la mascota. Devuelve como máximo 300.
 */
export function buscarMascotas(db: Pick<BaseDeDatos, '$client'>, filtro: z.output<typeof esquemaBuscarMascotas>): Mascota[] {
  const condiciones: string[] = [];
  const parametros: (string | number)[] = [];
  if (!filtro.incluirBajas) condiciones.push('m.activo = 1');
  for (const palabra of normalizar(filtro.texto).split(/\s+/).filter(Boolean)) {
    const termino = terminoDeBusqueda(palabra);
    if (!termino) continue;
    condiciones.push(`(m.busqueda LIKE ? ESCAPE '\\' OR d.busqueda LIKE ? ESCAPE '\\')`);
    parametros.push(`%${escaparLike(termino)}%`, `%${escaparLike(termino)}%`);
  }
  if (filtro.especie !== null) {
    condiciones.push('m.especie = ?');
    parametros.push(filtro.especie);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db.$client
    .prepare(`${SELECT} ${where} ORDER BY m.activo DESC, m.nombre COLLATE NOCASE, d.apellido COLLATE NOCASE LIMIT ${MAXIMO_RESULTADOS}`)
    .all(...parametros) as FilaMascota[];
  return filas.map(aMascota);
}

/** Dueños ya cargados, por apellido, nombre, DNI o teléfono. */
export function buscarDuenos(db: Pick<BaseDeDatos, '$client'>, filtro: z.output<typeof esquemaBuscarDuenos>): Dueno[] {
  const condiciones = ['activo = 1'];
  const parametros: string[] = [];
  for (const palabra of normalizar(filtro.texto).split(/\s+/).filter(Boolean)) {
    const termino = terminoDeBusqueda(palabra);
    if (!termino) continue;
    condiciones.push(`busqueda LIKE ? ESCAPE '\\'`);
    parametros.push(`%${escaparLike(termino)}%`);
  }
  const filas = db.$client
    .prepare(
      `SELECT id, nombre, apellido, dni, telefono, email, direccion, notas, activo FROM duenos
       WHERE ${condiciones.join(' AND ')} ORDER BY apellido COLLATE NOCASE, nombre COLLATE NOCASE LIMIT 20`,
    )
    .all(...parametros) as (Omit<Dueno, 'activo'> & { activo: number })[];
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

/** Crea el dueño o actualiza el que ya existe. Devuelve su id. */
function guardarDueno(db: BaseDeDatos, datos: z.output<typeof esquemaDueno>, momento: string): number {
  const dni = datos.dni || null;
  if (dni) {
    const otro = db.$client.prepare('SELECT id, apellido, nombre FROM duenos WHERE dni = ?').get(dni) as
      | { id: number; apellido: string; nombre: string }
      | undefined;
    if (otro && otro.id !== datos.id) throw new ErrorDeUsuario(`Ese DNI ya es de ${otro.apellido}, ${otro.nombre}: buscalo en "dueño existente" y sumale la mascota.`);
  }
  const valores = {
    nombre: datos.nombre,
    apellido: datos.apellido,
    dni,
    telefono: datos.telefono,
    email: datos.email,
    direccion: datos.direccion,
    notas: datos.notas,
    busqueda: textoDeBusquedaDueno({ ...datos, dni }),
  };
  if (datos.id) {
    const r = db.update(duenos).set({ ...valores, actualizadoEn: momento }).where(eq(duenos.id, datos.id)).run();
    if (r.changes === 0) throw new ErrorDeUsuario('Ese dueño ya no existe.');
    return datos.id;
  }
  return db.insert(duenos).values(valores).returning({ id: duenos.id }).get().id;
}

/** Guarda la mascota y su dueño juntos: o se guarda todo o no se guarda nada. */
export function guardarMascota(db: BaseDeDatos, datos: z.output<typeof esquemaMascota>, ahora: Date = new Date()): number {
  const momento = momentoLocal(ahora);
  if (datos.fechaNacimiento && datos.fechaNacimiento > momento.slice(0, 10)) {
    throw new ErrorDeUsuario('La fecha de nacimiento no puede ser futura.');
  }
  const chip = datos.microchip || null;
  if (chip) {
    const otra = db.$client.prepare('SELECT id, nombre FROM mascotas WHERE microchip = ?').get(chip) as { id: number; nombre: string } | undefined;
    if (otra && otra.id !== datos.id) throw new ErrorDeUsuario(`Ese microchip ya es de ${otra.nombre}.`);
  }
  return db.$client.transaction(() => {
    const duenoId = guardarDueno(db, datos.dueno, momento);
    const valores = {
      duenoId,
      nombre: datos.nombre,
      especie: datos.especie,
      raza: datos.raza,
      sexo: datos.sexo === '' ? null : datos.sexo,
      castrado: datos.castrado,
      fechaNacimiento: datos.fechaNacimiento || null,
      color: datos.color,
      microchip: chip,
      notas: datos.notas,
      busqueda: textoDeBusquedaMascota({ ...datos, microchip: chip }),
    };
    if (datos.id) {
      const r = db.update(mascotas).set({ ...valores, actualizadoEn: momento }).where(eq(mascotas.id, datos.id)).run();
      if (r.changes === 0) throw new ErrorDeUsuario('Esa mascota ya no existe.');
      return datos.id;
    }
    return db.insert(mascotas).values(valores).returning({ id: mascotas.id }).get().id;
  })();
}

/** Baja lógica: la mascota deja de aparecer, pero sus datos, turnos e historia quedan. */
export function cambiarActivoMascota(db: BaseDeDatos, id: number, activo: boolean): void {
  const r = db.update(mascotas).set({ activo }).where(eq(mascotas.id, id)).run();
  if (r.changes === 0) throw new ErrorDeUsuario('Esa mascota ya no existe.');
}
