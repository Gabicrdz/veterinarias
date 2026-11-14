// Internación y baños/peluquería: nombres, estados y cuentas que comparten el main y la ventana.
import { diasEntre } from './vacunas';

// ── Internación ──
/** Días que se cobran: desde el ingreso hasta hoy (o el alta). El mismo día cuenta 1 día. */
export function diasDeInternacion(ingreso: string, hasta: string): number {
  return Math.max(1, diasEntre(ingreso, hasta));
}
export const totalInternacion = (dias: number, tarifaDiariaCentavos: number): number => dias * tarifaDiariaCentavos;

// ── Baños y peluquería ──
export const TIPOS_ESTETICA = ['bano', 'bano_corte', 'corte', 'unas', 'deslanado'] as const;
export type TipoEstetica = (typeof TIPOS_ESTETICA)[number];
export const NOMBRE_ESTETICA: Record<TipoEstetica, string> = {
  bano: 'Baño',
  bano_corte: 'Baño y corte',
  corte: 'Corte de pelo',
  unas: 'Corte de uñas',
  deslanado: 'Deslanado',
};

export const ESTADOS_ESTETICA = ['esperando', 'en_proceso', 'listo', 'entregado', 'cancelado'] as const;
export type EstadoEstetica = (typeof ESTADOS_ESTETICA)[number];
export const NOMBRE_ESTADO_ESTETICA: Record<EstadoEstetica, string> = {
  esperando: 'Esperando',
  en_proceso: 'En proceso',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** El paso siguiente del tablero. `entregado` y `cancelado` son finales. */
export const SIGUIENTE_ESTETICA: Partial<Record<EstadoEstetica, EstadoEstetica>> = {
  esperando: 'en_proceso',
  en_proceso: 'listo',
  listo: 'entregado',
};
export const ACCION_ESTETICA: Partial<Record<EstadoEstetica, string>> = {
  esperando: 'Empezar',
  en_proceso: 'Terminar',
  listo: 'Entregar y cobrar',
};
export const sePuedeCancelar = (e: EstadoEstetica) => e === 'esperando' || e === 'en_proceso' || e === 'listo';
