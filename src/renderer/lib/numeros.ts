// Números escritos a mano en la pantalla. En Argentina se escribe "12,5" (coma
// decimal), pero muchos teclados numéricos ponen punto: se aceptan los dos.

/** '' → null (no se cargó). Texto que no es un número → NaN (para que el esquema avise). */
export function leerDecimal(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!limpio) return null;
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN;
}

const formato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const pesoLegible = (kg: number) => `${formato.format(kg)} kg`;
export const temperaturaLegible = (c: number) => `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(c)} °C`;

/** Desde 39,5 °C se considera fiebre en perros y gatos (referencia general, no es un diagnóstico). */
export const TEMPERATURA_FIEBRE = 39.5;
