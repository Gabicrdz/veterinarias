// Productos del mostrador (alimento, medicamentos, accesorios…): lo que comparten el main y la ventana.
//
// Las cantidades se guardan en MILÉSIMAS enteras (1 unidad = 1000, 1,5 kg = 1500), igual que el
// dinero en centavos: así el alimento suelto, que se vende por kilo, no tiene errores de coma.

export const CATEGORIAS_PRODUCTO = ['alimento', 'medicamento', 'higiene', 'accesorio', 'otro'] as const;
export type CategoriaProducto = (typeof CATEGORIAS_PRODUCTO)[number];
export const NOMBRE_CATEGORIA: Record<CategoriaProducto, string> = {
  alimento: 'Alimento',
  medicamento: 'Medicamento',
  higiene: 'Higiene',
  accesorio: 'Accesorio',
  otro: 'Otro',
};

export const UNIDADES = ['unidad', 'kg'] as const;
export type Unidad = (typeof UNIDADES)[number];
export const NOMBRE_UNIDAD: Record<Unidad, string> = { unidad: 'Por unidad', kg: 'Por kilo (suelto)' };

export const TIPOS_MOVIMIENTO = ['inicial', 'compra', 'venta', 'merma', 'ajuste'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  inicial: 'Stock inicial',
  compra: 'Compra',
  venta: 'Venta',
  merma: 'Merma (rotura, vencimiento)',
  ajuste: 'Ajuste por conteo',
};

export type EstadoStock = 'ok' | 'bajo' | 'sin_stock';
export const NOMBRE_ESTADO_STOCK: Record<EstadoStock, string> = { ok: 'En stock', bajo: 'Stock bajo', sin_stock: 'Sin stock' };

/** Sin stock: 0 o menos. Bajo: hasta el mínimo cargado (si no hay mínimo, nunca es "bajo"). */
export function estadoDeStock(stockMilesimas: number, minimoMilesimas: number): EstadoStock {
  if (stockMilesimas <= 0) return 'sin_stock';
  return minimoMilesimas > 0 && stockMilesimas <= minimoMilesimas ? 'bajo' : 'ok';
}

/** 1.5 → 1500. Math.round evita que 0,29 kg quede como 289 por el punto flotante. */
export const aMilesimas = (cantidad: number): number => Math.round(cantidad * 1000);

/** ¿Es una cantidad válida para la unidad? Por unidad: solo enteros. Por kilo: hasta 3 decimales (gramos). */
export function cantidadValida(milesimas: number, unidad: Unidad): boolean {
  if (!Number.isSafeInteger(milesimas) || milesimas <= 0) return false;
  return unidad === 'kg' ? true : milesimas % 1000 === 0;
}

/** Precio de la cantidad vendida, en centavos: 1,5 kg a $ 4.200 el kilo = $ 6.300. */
export function subtotalDe(cantidadMilesimas: number, precioCentavos: number): number {
  return Math.round((cantidadMilesimas * precioCentavos) / 1000);
}

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
/** 1500 → "1,5" · 12000 → "12". */
export const cantidadLegible = (milesimas: number): string => numero.format(milesimas / 1000);
/** 1500 → "1,5 kg" · 12000 → "12 u". */
export const cantidadConUnidad = (milesimas: number, unidad: Unidad): string => `${cantidadLegible(milesimas)} ${unidad === 'kg' ? 'kg' : 'u'}`;
