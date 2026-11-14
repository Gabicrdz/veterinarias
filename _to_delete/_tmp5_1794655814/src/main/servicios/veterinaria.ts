import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaVeterinaria } from '@compartido/esquemas';
import type { Veterinaria, Resumen } from '@compartido/tipos';

type Lector = Pick<BaseDeDatos, '$client'>;

export function obtenerVeterinaria(db: Lector): Veterinaria {
  const valores = new Map(
    (db.$client.prepare('SELECT clave, valor FROM configuracion').all() as { clave: string; valor: string }[]).map((f) => [f.clave, f.valor]),
  );
  return {
    nombreVeterinaria: valores.get('nombre_veterinaria') ?? 'Mi Veterinaria',
    direccion: valores.get('direccion') ?? '',
    telefono: valores.get('telefono') ?? '',
    mensajeRecordatorio: valores.get('mensaje_recordatorio') ?? '',
    mensajeVacuna: valores.get('mensaje_vacuna') ?? '',
    mensajeListo: valores.get('mensaje_listo') ?? '',
  };
}

export function guardarVeterinaria(db: BaseDeDatos, datos: z.output<typeof esquemaVeterinaria>): void {
  const guardar = db.$client.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor');
  db.$client.transaction(() => {
    guardar.run('nombre_veterinaria', datos.nombreVeterinaria);
    guardar.run('direccion', datos.direccion);
    guardar.run('telefono', datos.telefono);
  })();
}

export function guardarMensajeRecordatorio(db: BaseDeDatos, mensaje: string): void {
  db.$client
    .prepare("INSERT INTO configuracion (clave, valor) VALUES ('mensaje_recordatorio', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor")
    .run(mensaje);
}

export function guardarMensajeVacuna(db: BaseDeDatos, mensaje: string): void {
  db.$client
    .prepare("INSERT INTO configuracion (clave, valor) VALUES ('mensaje_vacuna', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor")
    .run(mensaje);
}

export function guardarMensajeListo(db: BaseDeDatos, mensaje: string): void {
  db.$client
    .prepare("INSERT INTO configuracion (clave, valor) VALUES ('mensaje_listo', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor")
    .run(mensaje);
}

/** Cuántos hay de cada cosa (activos). */
export function resumen(db: Lector): Resumen {
  const n = (tabla: string) => (db.$client.prepare(`SELECT count(*) AS n FROM ${tabla} WHERE activo = 1`).get() as { n: number }).n;
  const turnos = (db.$client.prepare('SELECT count(*) AS n FROM turnos').get() as { n: number }).n;
  return { mascotas: n('mascotas'), profesionales: n('profesionales'), turnos };
}
