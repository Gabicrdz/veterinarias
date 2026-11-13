// La historia clínica de la mascota: sus consultas, de la más nueva a la más vieja.
// Se usa dentro del diálogo de la consulta y en un diálogo propio desde la ficha.
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Lock } from 'lucide-react';
import type { Consulta } from '@compartido/tipos';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHistoria } from '@/features/agenda/consultas-agenda';
import { TEMPERATURA_FIEBRE, pesoLegible, temperaturaLegible } from '@/lib/numeros';
import { GraficoPeso } from './grafico-peso';

const fechaConDia = (f: string) => format(parseISO(f), "EEE d 'de' MMM yyyy", { locale: es });

export function ListaHistoria({ consultas, vacio = 'Todavía no tiene consultas cargadas.' }: { consultas: Consulta[]; vacio?: string }) {
  if (!consultas.length) return <p className="text-[14px] text-tinta-suave">{vacio}</p>;
  return (
    <ol className="flex flex-col gap-4">
      {consultas.map((c) => (
        <li key={c.id} className="border-l-2 border-linea-fuerte pl-4">
          <p className="flex items-center gap-2 text-[13px] text-tinta-suave">
            <span className="font-semibold text-tinta first-letter:uppercase">{fechaConDia(c.fecha)}</span>· {c.profesional}
            {!c.editable && <Lock className="size-3" aria-label="Cerrada" />}
          </p>
          {(c.pesoKg !== null || c.temperaturaC !== null) && (
            <p className="numeros mt-0.5 flex gap-3 text-[13px] text-tinta-suave">
              {c.pesoKg !== null && <span>Peso {pesoLegible(c.pesoKg)}</span>}
              {c.temperaturaC !== null && (
                <span className={c.temperaturaC >= TEMPERATURA_FIEBRE ? 'font-semibold text-rojo' : undefined}>
                  Temp. {temperaturaLegible(c.temperaturaC)}
                  {c.temperaturaC >= TEMPERATURA_FIEBRE && ' · fiebre'}
                </span>
              )}
            </p>
          )}
          {(c.diagnostico || c.motivo) && (
            <p className="mt-0.5 font-display text-[16px] font-semibold">
              {c.diagnostico || c.motivo}
              {c.diagnostico && c.motivo && <span className="font-sans text-[13px] font-normal text-tinta-suave"> · consultó por {c.motivo.toLowerCase()}</span>}
            </p>
          )}
          <p className="mt-1 text-[14px] whitespace-pre-line">{c.evolucion}</p>
          {c.indicaciones && (
            <p className="mt-1 text-[14px] whitespace-pre-line text-tinta-suave">
              <span className="font-semibold text-tinta">Indicaciones: </span>
              {c.indicaciones}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Diálogo con toda la historia (desde la ficha de la mascota). */
export function DialogoHistoria({ mascota, alCerrar }: { mascota: { id: number; nombre: string } | null; alCerrar: () => void }) {
  const historia = useHistoria(mascota?.id ?? null);
  return (
    <Dialog open={mascota !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Historia clínica · {mascota?.nombre}</DialogTitle>
          <DialogDescription>
            {historia.data ? `${historia.data.length} ${historia.data.length === 1 ? 'consulta' : 'consultas'}. ` : ''}Las notas se pueden corregir solo el día en que se cargaron.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6">
          {historia.data ? (
            <>
              <GraficoPeso consultas={historia.data} />
              <ListaHistoria consultas={historia.data} />
            </>
          ) : (
            <p className="text-tinta-suave">Cargando…</p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
