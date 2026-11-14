// Consultas y acciones de la internación. Dar el alta cobra: por eso también refresca el reporte.
import { useQuery } from '@tanstack/react-query';
import type { DatosAlta, DatosEvolucion, DatosIngreso } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

export const useInternadas = () => useQuery({ queryKey: [...CLAVES.internacion, 'internadas'], queryFn: () => desenvolver(turnos().internacion.internadas()), staleTime: 0 });
export const useAltas = () => useQuery({ queryKey: [...CLAVES.internacion, 'altas'], queryFn: () => desenvolver(turnos().internacion.altas()), staleTime: 0 });
export const useEvoluciones = (id: number | null) =>
  useQuery({ queryKey: [...CLAVES.internacion, 'evoluciones', id], queryFn: () => desenvolver(turnos().internacion.evoluciones(id!)), enabled: id !== null, staleTime: 0 });
/** Cuántas mascotas hay internadas: el número al lado de "Internación" en el menú. */
export const useCantidadInternadas = () =>
  useQuery({ queryKey: [...CLAVES.internacion, 'cantidad'], queryFn: () => desenvolver(turnos().internacion.cantidad()), staleTime: 60_000, refetchInterval: 5 * 60_000 });

const AFECTADAS = [CLAVES.internacion, CLAVES.reporte];
export const useIngresar = () => useAccion((d: DatosIngreso) => desenvolver(turnos().internacion.ingresar(d)), AFECTADAS, 'Mascota internada');
export const useEvolucionar = () => useAccion((d: DatosEvolucion) => desenvolver(turnos().internacion.evolucionar(d)), AFECTADAS, 'Nota guardada');
export const useDarAlta = () => useAccion((d: DatosAlta) => desenvolver(turnos().internacion.alta(d)), AFECTADAS, 'Alta registrada');
export const useCargarServiciosEjemplo = () =>
  useAccion((_: void) => desenvolver(turnos().sistema.cargarServiciosEjemplo()), [CLAVES.internacion, CLAVES.estetica, CLAVES.reporte], (n) => `Listo: ${n} internaciones y baños de ejemplo`);
