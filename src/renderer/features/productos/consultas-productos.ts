// Consultas y acciones de productos y ventas. El stock sale de sumar movimientos, así que
// una venta, una compra o un ajuste refrescan la lista de productos, el aviso del menú y el reporte.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosBuscarProductos, DatosMovimiento, DatosProducto, DatosVenta } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

export function useProductos(filtro: DatosBuscarProductos) {
  return useQuery({
    queryKey: [...CLAVES.productos, 'lista', filtro],
    queryFn: () => desenvolver(turnos().productos.buscar(filtro)),
    placeholderData: keepPreviousData,
  });
}

export const useMovimientos = (productoId: number | null) =>
  useQuery({
    queryKey: [...CLAVES.productos, 'movimientos', productoId],
    queryFn: () => desenvolver(turnos().productos.movimientos(productoId!)),
    enabled: productoId !== null,
    staleTime: 0,
  });

/** Productos con stock bajo o sin stock: el número al lado de "Productos" en el menú. */
export const useParaReponer = () =>
  useQuery({
    queryKey: [...CLAVES.productos, 'para-reponer'],
    queryFn: () => desenvolver(turnos().productos.paraReponer()),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

export const useVentasDelDia = (fecha: string) =>
  useQuery({
    queryKey: [...CLAVES.ventas, fecha],
    queryFn: () => desenvolver(turnos().ventas.delDia(fecha)),
    staleTime: 0,
  });

const AFECTADAS = [CLAVES.productos, CLAVES.ventas, CLAVES.reporte];

export const useGuardarProducto = () => useAccion((d: DatosProducto) => desenvolver(turnos().productos.guardar(d)), AFECTADAS, 'Producto guardado');
export const useCambiarActivo = () =>
  useAccion((a: { id: number; activo: boolean }) => desenvolver(turnos().productos.cambiarActivo(a.id, a.activo)), AFECTADAS, 'Listo');
export const useMovimiento = () => useAccion((d: DatosMovimiento) => desenvolver(turnos().productos.movimiento(d)), AFECTADAS, 'Movimiento registrado');
export const useRegistrarVenta = () => useAccion((d: DatosVenta) => desenvolver(turnos().ventas.registrar(d)), AFECTADAS, 'Venta registrada');
export const useAnularVenta = () => useAccion((id: number) => desenvolver(turnos().ventas.anular(id)), AFECTADAS, 'Venta anulada');
export const useCargarProductosEjemplo = () =>
  useAccion((_: void) => desenvolver(turnos().sistema.cargarProductosEjemplo()), AFECTADAS, (n) => `Listo: productos y ${n} ventas de ejemplo`);

export const avisarError = (e: Error) => toast.error(e.message);
