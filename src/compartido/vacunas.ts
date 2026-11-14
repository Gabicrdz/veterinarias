// Vacunas y desparasitaciones: lo que comparten el main y la ventana (funciones puras).
import type { Especie } from './tipos';

export const TIPOS_APLICACION = ['vacuna', 'desparasitacion'] as const;
export type TipoAplicacion = (typeof TIPOS_APLICACION)[number];
export const NOMBRE_TIPO: Record<TipoAplicacion, string> = { vacuna: 'Vacuna', desparasitacion: 'Desparasitación' };

/** Cuánto antes de la próxima dosis se empieza a avisar. */
export const DIAS_DE_AVISO = 30;

export interface Sugerida {
  nombre: string;
  tipo: TipoAplicacion;
  /** Cada cuántos meses suele repetirse (referencia general: lo decide el veterinario). */
  cadaMeses: number;
}

const DESPARASITACIONES: Sugerida[] = [
  { nombre: 'Desparasitación interna', tipo: 'desparasitacion', cadaMeses: 3 },
  { nombre: 'Desparasitación externa (pulgas y garrapatas)', tipo: 'desparasitacion', cadaMeses: 1 },
];

/** Las más comunes por especie, para elegir con un toque. Se puede escribir cualquier otra. */
export const SUGERIDAS: Partial<Record<Especie, Sugerida[]>> = {
  perro: [
    { nombre: 'Quíntuple / Séxtuple', tipo: 'vacuna', cadaMeses: 12 },
    { nombre: 'Antirrábica', tipo: 'vacuna', cadaMeses: 12 },
    { nombre: 'Tos de las perreras', tipo: 'vacuna', cadaMeses: 12 },
    ...DESPARASITACIONES,
  ],
  gato: [
    { nombre: 'Triple felina', tipo: 'vacuna', cadaMeses: 12 },
    { nombre: 'Leucemia felina', tipo: 'vacuna', cadaMeses: 12 },
    { nombre: 'Antirrábica', tipo: 'vacuna', cadaMeses: 12 },
    ...DESPARASITACIONES,
  ],
};
export const SUGERIDAS_GENERALES: Sugerida[] = [{ nombre: 'Antirrábica', tipo: 'vacuna', cadaMeses: 12 }, ...DESPARASITACIONES];

export const sugeridasDe = (especie: Especie): Sugerida[] => SUGERIDAS[especie] ?? SUGERIDAS_GENERALES;

/**
 * Suma meses a una fecha 'AAAA-MM-DD'. Si el día no existe en el mes de llegada
 * se queda en el último día de ese mes (31/01 + 1 mes = 28/02, no 03/03).
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const destino = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimo);
  return `${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Días entre dos fechas 'AAAA-MM-DD' (hasta − desde). Positivo si "hasta" es después. */
export function diasEntre(desde: string, hasta: string): number {
  const f = (s: string) => {
    const [a, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((f(hasta) - f(desde)) / 86_400_000);
}

export type EstadoDosis = 'vencida' | 'esta_semana' | 'proxima';

/** Vencida: ya pasó. Esta semana: en 7 días o menos (hoy incluido). Próxima: más adelante. */
export function estadoDeDosis(proxima: string, hoy: string): EstadoDosis {
  const dias = diasEntre(hoy, proxima);
  return dias < 0 ? 'vencida' : dias <= 7 ? 'esta_semana' : 'proxima';
}
