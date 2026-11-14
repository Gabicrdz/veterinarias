// WhatsApp: pasar el teléfono como lo escribe la gente al formato internacional
// que pide wa.me, y armar el mensaje del recordatorio. Funciones puras: la
// ventana las usa para avisar "sin celular" y el main, para armar el enlace.

/**
 * Celular argentino → formato de WhatsApp: 54 + 9 + código de área (sin 0) + número (sin 15).
 *   "370 455-1020"        → "5493704551020"
 *   "0370 15 455-1020"    → "5493704551020"
 *   "+54 9 11 2345-6789"  → "5491123456789"
 * Si no se puede saber con seguridad (le faltan números, es un fijo de 8 cifras…), devuelve null.
 */
export function numeroWhatsApp(telefono: string): string | null {
  let n = telefono.replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('54')) {
    n = n.slice(2);
    if (n.startsWith('9')) n = n.slice(1);
  }
  if (n.startsWith('0')) n = n.slice(1);
  // El "15" va después del código de área (de 2, 3 o 4 cifras): si sobran 2 números, es el 15
  if (n.length === 12) {
    const sin15 = [2, 3, 4].map((i) => (n.slice(i, i + 2) === '15' ? n.slice(0, i) + n.slice(i + 2) : null)).find((x) => x !== null);
    if (!sin15) return null;
    n = sin15;
  }
  return n.length === 10 ? `549${n}` : null;
}

export interface DatosMensaje {
  /** Nombre del DUEÑO (a quien le llega el mensaje). */
  nombre: string;
  apellido: string;
  mascota: string;
  profesional: string;
  /** "miércoles 11/11" */
  dia: string;
  hora: string;
  veterinaria: string;
  direccion: string;
}

export const MARCADORES: { marca: string; explicacion: string }[] = [
  { marca: '{nombre}', explicacion: 'nombre del dueño' },
  { marca: '{apellido}', explicacion: 'apellido del dueño' },
  { marca: '{mascota}', explicacion: 'nombre de la mascota' },
  { marca: '{profesional}', explicacion: 'Dra. Laura Benítez' },
  { marca: '{dia}', explicacion: 'miércoles 11/11' },
  { marca: '{hora}', explicacion: '08:20' },
  { marca: '{veterinaria}', explicacion: 'nombre de la veterinaria' },
  { marca: '{direccion}', explicacion: 'dirección de la veterinaria' },
];

/** Reemplaza {nombre}, {dia}, etc. Las marcas que no existen quedan como están. */
export function reemplazarMarcas(plantilla: string, datos: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (marca, clave: string) => (Object.hasOwn(datos, clave) ? datos[clave]! : marca));
}

export function armarMensaje(plantilla: string, datos: DatosMensaje): string {
  return reemplazarMarcas(plantilla, { ...datos });
}

// ---- Aviso de próxima dosis (vacunas y desparasitaciones) ----
export interface DatosMensajeVacuna {
  nombre: string;
  apellido: string;
  mascota: string;
  /** "Antirrábica" */
  vacuna: string;
  /** "20/11/2026" */
  fecha: string;
  veterinaria: string;
  direccion: string;
}

export const MARCADORES_VACUNA: { marca: string; explicacion: string }[] = [
  { marca: '{nombre}', explicacion: 'nombre del dueño' },
  { marca: '{apellido}', explicacion: 'apellido del dueño' },
  { marca: '{mascota}', explicacion: 'nombre de la mascota' },
  { marca: '{vacuna}', explicacion: 'Antirrábica' },
  { marca: '{fecha}', explicacion: '20/11/2026' },
  { marca: '{veterinaria}', explicacion: 'nombre de la veterinaria' },
  { marca: '{direccion}', explicacion: 'dirección de la veterinaria' },
];

export const armarMensajeVacuna = (plantilla: string, datos: DatosMensajeVacuna) => reemplazarMarcas(plantilla, { ...datos });

/** El enlace que abre WhatsApp (en la compu o el celular) con el mensaje ya escrito. */
export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
