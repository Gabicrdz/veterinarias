// Consultas y acciones del tablero de baños y peluquería. Entregar cobra: refresca también el reporte.
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosCambioEstetica, DatosServicioEstetica } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

export const useTablero = () =>
  useQuery({ queryKey: [...CLAVES.estetica, 'tablero'], queryFn: () => desenvolver(turnos().estetica.tablero()), staleTime: 0, refetchInterval: 60_000 });
export const usePreciosEstetica = () =>
  useQuery({ queryKey: [...CLAVES.estetica, 'precios'], queryFn: () => desenvolver(turnos().estetica.precios()), staleTime: 0 });

const AFECTADAS = [CLAVES.estetica, CLAVES.reporte];
export const useCrearServicio = () => useAccion((d: DatosServicioEstetica) => desenvolver(turnos().estetica.crear(d)), AFECTADAS, 'Servicio cargado');
export const useCambiarServicio = () => useAccion((d: DatosCambioEstetica) => desenvolver(turnos().estetica.cambiar(d)), AFECTADAS);
export const useAvisarListo = () =>
  useAccion((id: number) => desenvolver(turnos().estetica.avisar(id)), [CLAVES.estetica], 'Se abrió WhatsApp con el aviso');

export const avisarError = (e: Error) => toast.error(e.message);
