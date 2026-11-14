// El carnet de vacunación de la mascota: todo lo que se le aplicó y cuándo toca lo próximo.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { Especie } from '@compartido/tipos';
import { NOMBRE_TIPO, estadoDeDosis } from '@compartido/vacunas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Confirmar } from '@/features/comun/confirmar';
import { fechaCorta, fechaISO } from '@/lib/fechas';
import { useAnularAplicacion, useCarnet } from './consultas-vacunas';

interface Props {
  mascota: { id: number; nombre: string; especie: Especie } | null;
  alCerrar: () => void;
  /** Abre el formulario para registrar una aplicación (lo muestra la pantalla que lo usa). */
  alRegistrar: (m: { id: number; nombre: string; especie: Especie }) => void;
}

export function DialogoCarnet({ mascota, alCerrar, alRegistrar }: Props) {
  const carnet = useCarnet(mascota?.id ?? null);
  const anular = useAnularAplicacion();
  const [aAnular, setAAnular] = useState<{ id: number; nombre: string; fecha: string } | null>(null);
  const hoy = fechaISO();
  return (
    <Dialog open={mascota !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Carnet de vacunación · {mascota?.nombre}</DialogTitle>
          <DialogDescription>{mascota ? NOMBRE_ESPECIE[mascota.especie] : ''}. Una carga equivocada se anula (no se borra).</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div>
            <Button size="sm" onClick={() => mascota && alRegistrar(mascota)}>
              <Plus aria-hidden="true" />
              Registrar aplicación
            </Button>
          </div>
          {!carnet.data ? (
            <p className="text-tinta-suave">Cargando…</p>
          ) : carnet.data.length === 0 ? (
            <p className="text-[14px] text-tinta-suave">Todavía no tiene aplicaciones cargadas.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-linea">
              {carnet.data.map((a) => {
                const toca = a.proximaDosis && !a.renovada ? estadoDeDosis(a.proximaDosis, hoy) : null;
                return (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {a.nombre} <span className="font-normal text-tinta-suave">· {NOMBRE_TIPO[a.tipo].toLowerCase()}</span>
                      </p>
                      <p className="numeros text-[14px] text-tinta-suave">
                        Aplicada el {fechaCorta(a.fecha)}
                        {a.lote && ` · lote ${a.lote}`}
                        {a.registradoPor && ` · ${a.registradoPor}`}
                      </p>
                      {a.notas && <p className="text-[14px] text-tinta-suave">{a.notas}</p>}
                      {a.proximaDosis && (
                        <p className="numeros mt-1 flex flex-wrap items-center gap-2 text-[14px]">
                          Próxima dosis: {fechaCorta(a.proximaDosis)}
                          {a.renovada && <Badge variant="contorno">Ya renovada</Badge>}
                          {toca === 'vencida' && <Badge variant="rojo">Vencida</Badge>}
                          {toca === 'esta_semana' && <Badge variant="acento">Esta semana</Badge>}
                          {a.avisadoEn && !a.renovada && <Badge variant="verde">Avisado el {fechaCorta(a.avisadoEn.slice(0, 10))}</Badge>}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost-destructive" size="sm" disabled={anular.isPending} onClick={() => setAAnular({ id: a.id, nombre: a.nombre, fecha: a.fecha })} aria-label={`Anular ${a.nombre} del ${fechaCorta(a.fecha)}`}>
                      <X aria-hidden="true" />
                      Anular
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
        <Confirmar
          confirmacion={
            aAnular
              ? {
                  titulo: '¿Anular esta aplicación?',
                  descripcion: `${aAnular.nombre} del ${fechaCorta(aAnular.fecha)} sale del carnet (queda registrada como anulada). Si fue una carga equivocada, después podés cargarla bien.`,
                  boton: 'Anular',
                  volver: 'Volver',
                  alConfirmar: () => {
                    anular.mutate(aAnular.id);
                    setAAnular(null);
                  },
                }
              : null
          }
          alCerrar={() => setAAnular(null)}
        />
      </DialogContent>
    </Dialog>
  );
}
