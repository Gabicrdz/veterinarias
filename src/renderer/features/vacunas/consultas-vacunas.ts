// Consultas y acciones de vacunas. Cualquier cambio refresca el carnet, la lista
// de dosis que tocan y el número del menú (todo cuelga de la misma clave).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosAplicacion } from '@compartido/esquemas';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';

export function useCarnet(mascotaId: number | null) {
  return useQuery({
    queryKey: [...CLAVES.vacunas, 'carnet', mascotaId],
    queryFn: () => desenvolver(turnos().vacunas.carnet(mascotaId!)),
    enabled: mascotaId !== null,
    staleTime: 0,
  });
}

export function usePendientes(dentroDeDias: number) {
  return useQuery({
    queryKey: [...CLAVES.vacunas, 'pendientes', dentroDeDias],
    queryFn: () => desenvolver(turnos().vacunas.pendientes({ dentroDeDias })),
    placeholderData: keepPreviousData,
    // La lista depende del día: si la pantalla queda abierta, se actualiza sola
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Dosis ya vencidas: el número al lado de "Vacunas" en el menú. */
export const useVencidas = () =>
  useQuery({
    queryKey: [...CLAVES.vacunas, 'vencidas'],
    queryFn: () => desenvolver(turnos().vacunas.vencidas()),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

const AFECTADAS = [CLAVES.vacunas];

export const useRegistrarAplicacion = () => useAccion((d: DatosAplicacion) => desenvolver(turnos().vacunas.registrar(d)), AFECTADAS, 'Aplicación registrada');
export const useAnularAplicacion = () => useAccion((id: number) => desenvolver(turnos().vacunas.anular(id)), AFECTADAS, 'Aplicación anulada');

export const useCargarVacunasEjemplo = () =>
  useAccion((_: void) => desenvolver(turnos().sistema.cargarVacunasEjemplo()), AFECTADAS, (n) => `Listo: ${n} aplicaciones de ejemplo cargadas`);

/** Abre WhatsApp con el aviso (lo arma el main) y refresca para mostrar "avisado". */
export function useAvisar() {
  const accion = useAccion((id: number) => desenvolver(turnos().vacunas.avisar(id)), AFECTADAS);
  return { ...accion, avisar: (id: number) => accion.mutate(id, { onError: (e) => toast.error(e.message) }) };
}
