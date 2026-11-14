// Baños y peluquería: un tablero con tres columnas. Cada mascota avanza de "Esperando" a
// "En proceso" y "Listo para retirar"; al entregarla se cobra.
import { useState } from 'react';
import { Check, MessageCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { pesos } from '@compartido/dinero';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import { ACCION_ESTETICA, NOMBRE_ESTADO_ESTETICA, NOMBRE_ESTETICA, SIGUIENTE_ESTETICA, type EstadoEstetica } from '@compartido/servicios';
import type { MetodoPago, ServicioEstetica } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fechaCorta } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Confirmar } from '@/features/comun/confirmar';
import { Encabezado } from '@/features/comun/encabezado';
import { SelectorMetodo } from '@/features/comun/selector-metodo';
import { avisarError, useAvisarListo, useCambiarServicio, useTablero } from './consultas-estetica';
import { DialogoServicio } from './dialogo-servicio';

const COLUMNAS: { estado: EstadoEstetica; ayuda: string }[] = [
  { estado: 'esperando', ayuda: 'Llegaron y esperan su turno' },
  { estado: 'en_proceso', ayuda: 'Se están bañando o peinando' },
  { estado: 'listo', ayuda: 'Avisá al dueño y entregala' },
];

export function PaginaEstetica() {
  const [nuevo, setNuevo] = useState(false);
  const [entregando, setEntregando] = useState<ServicioEstetica | null>(null);
  const [cancelando, setCancelando] = useState<ServicioEstetica | null>(null);
  const tablero = useTablero();
  const cambiar = useCambiarServicio();
  const avisar = useAvisarListo();

  function avanzar(s: ServicioEstetica) {
    const siguiente = SIGUIENTE_ESTETICA[s.estado];
    if (!siguiente) return;
    // Entregar cobra: si tiene precio se pregunta cómo paga; si es sin cargo se entrega directo
    if (siguiente === 'entregado' && s.precioCentavos > 0) return setEntregando(s);
    cambiar.mutate({ id: s.id, estado: siguiente, metodo: null }, { onError: avisarError });
  }

  const t = tablero.data;
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Baños y peluquería" detalle="El tablero de hoy: cada mascota pasa de una columna a la siguiente.">
        {t && t.cobradoHoyCentavos > 0 && (
          <p className="numeros mr-2 text-[15px] text-tinta-suave">
            Cobrado hoy: <strong className="text-tinta">{pesos(t.cobradoHoyCentavos)}</strong>
          </p>
        )}
        <Button onClick={() => setNuevo(true)}>
          <Plus aria-hidden="true" />
          Cargar baño
        </Button>
      </Encabezado>

      {tablero.isError ? (
        <p role="alert" className="font-medium text-rojo">
          No se pudo cargar el tablero: {tablero.error.message}
        </p>
      ) : !t ? (
        <p className="text-tinta-suave">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 items-start gap-5">
            {COLUMNAS.map((c) => {
              const lista = t.activos.filter((s) => s.estado === c.estado);
              return (
                <section key={c.estado} aria-label={NOMBRE_ESTADO_ESTETICA[c.estado]} className="flex flex-col gap-3 rounded-lg bg-lateral/60 p-3">
                  <header className="px-1">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                      {NOMBRE_ESTADO_ESTETICA[c.estado]}
                      <span className="numeros rounded-full bg-superficie px-2 text-[13px] font-medium text-tinta-suave">{lista.length}</span>
                    </h2>
                    <p className="text-[13px] text-tinta-suave">{c.ayuda}</p>
                  </header>
                  {lista.length === 0 ? (
                    <p className="rounded-md border border-dashed border-linea-fuerte px-3 py-6 text-center text-[14px] text-tinta-suave">Nadie por acá</p>
                  ) : (
                    lista.map((s) => (
                      <Tarjeta
                        key={s.id}
                        s={s}
                        hoy={t.hoy}
                        ocupado={cambiar.isPending}
                        avanzar={() => avanzar(s)}
                        cancelar={() => setCancelando(s)}
                        avisar={() => avisar.mutate(s.id, { onError: avisarError })}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <section aria-label="Próximos turnos" className="rounded-lg border border-linea bg-superficie">
              <h2 className="border-b border-linea px-5 py-3 font-display text-lg font-semibold">Próximos turnos</h2>
              {t.proximos.length === 0 ? (
                <p className="px-5 py-5 text-[14px] text-tinta-suave">No hay turnos de baño para los próximos días.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {t.proximos.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-[15px]">
                      <span className="numeros w-14 text-tinta-suave">{fechaCorta(s.fecha).slice(0, 5)}</span>
                      <span className="flex-1">
                        <strong>{s.mascota}</strong> · {NOMBRE_ESTETICA[s.tipo]}
                      </span>
                      <Button size="sm" variant="ghost-destructive" onClick={() => setCancelando(s)}>
                        Cancelar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Entregados hoy" className="rounded-lg border border-linea bg-superficie">
              <h2 className="border-b border-linea px-5 py-3 font-display text-lg font-semibold">Entregados hoy</h2>
              {t.entregadosHoy.length === 0 ? (
                <p className="px-5 py-5 text-[14px] text-tinta-suave">Todavía no se entregó ninguno.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {t.entregadosHoy.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-[15px]">
                      <Check aria-hidden="true" className="size-4 text-verde" />
                      <span className="flex-1">
                        <strong>{s.mascota}</strong> · {NOMBRE_ESTETICA[s.tipo]}
                      </span>
                      <span className="numeros font-semibold">{pesos(s.precioCentavos)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <DialogoServicio abierto={nuevo} alCerrar={() => setNuevo(false)} />
      <DialogoEntrega
        servicio={entregando}
        alCerrar={() => setEntregando(null)}
        alEntregar={(s, metodo) =>
          cambiar.mutate({ id: s.id, estado: 'entregado', metodo }, { onSuccess: () => { setEntregando(null); toast.success(`${s.mascota} entregada`); }, onError: avisarError })
        }
      />
      <Confirmar
        confirmacion={
          cancelando
            ? {
                titulo: '¿Cancelar este turno?',
                descripcion: `${cancelando.mascota} (${NOMBRE_ESTETICA[cancelando.tipo]}) sale del tablero. No se cobra nada.`,
                boton: 'Cancelar turno',
                volver: 'Volver',
                alConfirmar: () => {
                  const id = cancelando.id;
                  setCancelando(null);
                  cambiar.mutate({ id, estado: 'cancelado', metodo: null }, { onError: avisarError });
                },
              }
            : null
        }
        alCerrar={() => setCancelando(null)}
      />
    </div>
  );
}

function Tarjeta({ s, hoy, ocupado, avanzar, cancelar, avisar }: { s: ServicioEstetica; hoy: string; ocupado: boolean; avanzar: () => void; cancelar: () => void; avisar: () => void }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-linea bg-superficie p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-[19px] leading-tight font-semibold">{s.mascota}</p>
          <p className="text-[13px] text-tinta-suave">
            {NOMBRE_ESPECIE[s.especie]} · {s.dueno}
          </p>
        </div>
        <span className="numeros font-semibold">{s.precioCentavos > 0 ? pesos(s.precioCentavos) : 'Sin cargo'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="acento">{NOMBRE_ESTETICA[s.tipo]}</Badge>
        {s.fecha < hoy && <Badge variant="rojo">Del {fechaCorta(s.fecha).slice(0, 5)}</Badge>}
        {s.avisado && (
          <Badge variant="contorno">
            <Check aria-hidden="true" className="size-3.5" />
            Avisado
          </Badge>
        )}
      </div>
      {s.notas && <p className="text-[14px] text-tinta-suave">{s.notas}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={ocupado} onClick={avanzar}>
          {ACCION_ESTETICA[s.estado]}
        </Button>
        {s.estado === 'listo' && (
          <Button size="sm" variant="outline" disabled={!s.tieneWhatsApp} title={s.tieneWhatsApp ? undefined : 'El dueño no tiene un celular cargado'} onClick={avisar}>
            <MessageCircle aria-hidden="true" />
            {s.avisado ? 'Avisar de nuevo' : 'Avisar'}
          </Button>
        )}
        <Button size="sm" variant="ghost-destructive" className={cn('ml-auto')} onClick={cancelar}>
          Cancelar
        </Button>
      </div>
    </article>
  );
}

function DialogoEntrega({ servicio, alCerrar, alEntregar }: { servicio: ServicioEstetica | null; alCerrar: () => void; alEntregar: (s: ServicioEstetica, m: MetodoPago) => void }) {
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [error, setError] = useState('');
  return (
    <Dialog
      open={servicio !== null}
      onOpenChange={(a) => {
        if (!a) {
          setMetodo(null);
          setError('');
          alCerrar();
        }
      }}
    >
      {servicio && (
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Entregar a {servicio.mascota}</DialogTitle>
            <DialogDescription>
              {NOMBRE_ESTETICA[servicio.tipo]} · {servicio.dueno}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <p className="flex items-baseline justify-between">
              <span className="text-tinta-suave">Total a cobrar</span>
              <span className="numeros font-display text-[32px] leading-none font-semibold">{pesos(servicio.precioCentavos)}</span>
            </p>
            <SelectorMetodo valor={metodo} alCambiar={(m) => { setMetodo(m); setError(''); }} />
            <p role="alert" className="min-h-5 text-[14px] font-medium text-rojo">
              {error}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>
              Volver
            </Button>
            <Button onClick={() => (metodo ? alEntregar(servicio, metodo) : setError('Elegí cómo paga.'))}>Cobrar y entregar</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
