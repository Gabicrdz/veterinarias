// Vacunas: las dosis que ya pasaron y las que tocan en los próximos días, con el
// botón para avisarle al dueño por WhatsApp. Es la lista de trabajo de la recepción.
import { useState } from 'react';
import { BookOpenCheck, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { DosisPendiente, Especie } from '@compartido/tipos';
import { NOMBRE_TIPO, type EstadoDosis } from '@compartido/vacunas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fechaCorta } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { DialogoAplicacion } from './dialogo-aplicacion';
import { DialogoCarnet } from './dialogo-carnet';
import { useUsuario } from '@/features/sesion/consultas';
import { useAvisar, useCargarVacunasEjemplo, usePendientes } from './consultas-vacunas';

type Filtro = 'todas' | EstadoDosis;
const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: 'todas', nombre: 'Todas' },
  { valor: 'vencida', nombre: 'Vencidas' },
  { valor: 'esta_semana', nombre: 'Esta semana' },
  { valor: 'proxima', nombre: 'Próximas' },
];
const VENTANAS = [30, 60, 90];

/** "hace 12 días", "hoy", "mañana", "en 5 días". */
function cuando(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias < 0 ? `hace ${-dias} días` : `en ${dias} días`;
}

export function PaginaVacunas() {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ventana, setVentana] = useState(30);
  const [carnet, setCarnet] = useState<{ id: number; nombre: string; especie: Especie } | null>(null);
  const [registrar, setRegistrar] = useState<{ id: number; nombre: string; especie: Especie } | null>(null);
  const pendientes = usePendientes(ventana);
  const { avisar, isPending } = useAvisar();
  const { esAdmin } = useUsuario();
  const ejemplo = useCargarVacunasEjemplo();

  const lista = pendientes.data ?? [];
  const cuenta = (e: EstadoDosis) => lista.filter((d) => d.estado === e).length;
  const visibles = filtro === 'todas' ? lista : lista.filter((d) => d.estado === filtro);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Vacunas" detalle="Dosis vencidas y las que tocan pronto. Avisale al dueño con un toque.">
        <label className="flex items-center gap-2 text-[14px] text-tinta-suave">
          Mostrar próximas
          <Select value={String(ventana)} onValueChange={(v) => setVentana(Number(v))}>
            <SelectTrigger aria-label="Cuántos días mirar hacia adelante" className="h-9 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VENTANAS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} días
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </Encabezado>

      <div role="group" aria-label="Filtrar dosis" className="flex flex-wrap gap-2">
        {FILTROS.map((fl) => {
          const n = fl.valor === 'todas' ? lista.length : cuenta(fl.valor);
          return (
            <button
              key={fl.valor}
              type="button"
              aria-pressed={filtro === fl.valor}
              onClick={() => setFiltro(fl.valor)}
              className={cn(
                'numeros rounded-full border px-4 py-1.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                filtro === fl.valor ? 'border-acento bg-acento-suave font-semibold text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent hover:text-tinta',
              )}
            >
              {fl.nombre} · {n}
            </button>
          );
        })}
      </div>

      {pendientes.isError ? (
        <p role="alert" className="font-medium text-rojo">
          No se pudieron cargar las dosis: {pendientes.error.message}
        </p>
      ) : !pendientes.data ? (
        <p className="text-tinta-suave">Cargando…</p>
      ) : visibles.length === 0 ? (
        <Vacio
          titulo={lista.length === 0 ? 'No hay dosis pendientes' : 'Ninguna en esta categoría'}
          acciones={
            lista.length === 0 && esAdmin ? (
              <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate(undefined, { onError: (e) => toast.error(e.message) })}>
                Cargar vacunas de ejemplo
              </Button>
            ) : undefined
          }
        >
          {lista.length === 0
            ? `Ninguna mascota tiene una dosis vencida ni que toque en los próximos ${ventana} días. Las vacunas se cargan desde el carnet de cada mascota (Mascotas → Carnet).`
            : 'Probá con otra categoría.'}
        </Vacio>
      ) : (
        <section aria-label="Dosis pendientes" className="rounded-lg border border-linea bg-superficie">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-linea text-left text-[13px] font-medium text-tinta-suave">
                <th className="px-5 py-3 font-medium">Mascota</th>
                <th className="py-3 font-medium">Dosis</th>
                <th className="py-3 font-medium">Toca</th>
                <th className="px-5 py-3 text-right font-medium">Aviso</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => (
                <Fila key={d.aplicacionId} d={d} enviando={isPending} avisar={avisar} abrirCarnet={() => setCarnet({ id: d.mascotaId, nombre: d.mascota, especie: d.especie })} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <DialogoCarnet mascota={carnet} alCerrar={() => setCarnet(null)} alRegistrar={setRegistrar} />
      <DialogoAplicacion mascota={registrar} alCerrar={() => setRegistrar(null)} />
    </div>
  );
}

function Fila({ d, avisar, enviando, abrirCarnet }: { d: DosisPendiente; avisar: (id: number) => void; enviando: boolean; abrirCarnet: () => void }) {
  return (
    <tr className="border-b border-linea last:border-b-0">
      <td className="px-5 py-3">
        <p className="font-display text-[17px] leading-tight font-semibold">{d.mascota}</p>
        <p className="text-[13px] text-tinta-suave">
          {NOMBRE_ESPECIE[d.especie]} · {d.dueno}
        </p>
      </td>
      <td className="py-3">
        <p className="font-medium">{d.nombre}</p>
        <p className="text-[13px] text-tinta-suave">{NOMBRE_TIPO[d.tipo]}</p>
      </td>
      <td className="numeros py-3">
        <p className="flex items-center gap-2">
          {fechaCorta(d.proximaDosis)}
          {d.estado === 'vencida' && <Badge variant="rojo">Vencida</Badge>}
          {d.estado === 'esta_semana' && <Badge variant="acento">Esta semana</Badge>}
        </p>
        <p className="text-[13px] text-tinta-suave">{cuando(d.dias)}</p>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          {d.avisadoEn && <span className="numeros text-[13px] text-verde">Avisado el {fechaCorta(d.avisadoEn.slice(0, 10))}</span>}
          <Button
            size="sm"
            variant={d.avisadoEn ? 'outline' : 'default'}
            disabled={enviando || !d.tieneWhatsApp}
            title={d.tieneWhatsApp ? undefined : d.telefono ? 'El teléfono no parece un celular con código de área: revisalo en la ficha.' : 'No tiene teléfono cargado: agregalo en la ficha de la mascota.'}
            onClick={() => avisar(d.aplicacionId)}
          >
            <MessageCircle aria-hidden="true" />
            {d.avisadoEn ? 'Volver a avisar' : 'Avisar'}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Carnet de ${d.mascota}`} title="Ver carnet" onClick={abrirCarnet}>
            <BookOpenCheck aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
