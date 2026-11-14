// Internación: las mascotas que están hoy en la veterinaria, cómo evolucionan y cuándo se van.
import { useState } from 'react';
import { BedDouble, Plus, Thermometer } from 'lucide-react';
import { toast } from 'sonner';
import { pesos } from '@compartido/dinero';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { Internacion } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fechaCorta } from '@/lib/fechas';
import { TEMPERATURA_FIEBRE, temperaturaLegible } from '@/lib/numeros';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { useUsuario } from '@/features/sesion/consultas';
import { useAltas, useCargarServiciosEjemplo, useInternadas } from './consultas-internacion';
import { DialogoFicha, momentoCorto } from './dialogo-ficha';
import { DialogoIngreso } from './dialogo-ingreso';

export function PaginaInternacion() {
  const [ingresando, setIngresando] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);
  const { esAdmin } = useUsuario();
  const internadas = useInternadas();
  const altas = useAltas();
  const ejemplo = useCargarServiciosEjemplo();

  const todas = [...(internadas.data ?? []), ...(altas.data ?? [])];
  const seleccionada = todas.find((i) => i.id === abierta) ?? null;
  const cargando = !internadas.data || !altas.data;
  const vacio = !cargando && internadas.data.length === 0 && altas.data.length === 0;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Internación" detalle="Las mascotas que están hoy en la veterinaria, con sus notas de evolución.">
        <Button onClick={() => setIngresando(true)}>
          <Plus aria-hidden="true" />
          Internar mascota
        </Button>
      </Encabezado>

      {internadas.isError ? (
        <p role="alert" className="font-medium text-rojo">
          No se pudo cargar la internación: {internadas.error.message}
        </p>
      ) : cargando ? (
        <p className="text-tinta-suave">Cargando…</p>
      ) : vacio ? (
        <Vacio
          titulo="Todavía no hubo internaciones"
          acciones={
            <>
              <Button onClick={() => setIngresando(true)}>Internar la primera</Button>
              {esAdmin && (
                <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate(undefined, { onError: (e) => toast.error(e.message) })}>
                  Cargar internaciones y baños de ejemplo
                </Button>
              )}
            </>
          }
        >
          Cuando una mascota queda en la veterinaria, anotás por qué, dónde está y cómo evoluciona cada día. Al darle el alta se cobran los días.
        </Vacio>
      ) : (
        <>
          <section aria-label="Internadas hoy">
            <h2 className="mb-3 font-display text-xl font-semibold">
              Internadas hoy <span className="numeros font-sans text-[15px] font-normal text-tinta-suave">({internadas.data.length})</span>
            </h2>
            {internadas.data.length === 0 ? (
              <p className="rounded-lg border border-dashed border-linea-fuerte px-6 py-8 text-center text-tinta-suave">No hay mascotas internadas en este momento.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-4">
                {internadas.data.map((i) => (
                  <li key={i.id}>
                    <TarjetaInternada i={i} abrir={() => setAbierta(i.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {altas.data.length > 0 && (
            <section aria-label="Altas recientes" className="rounded-lg border border-linea bg-superficie">
              <h2 className="border-b border-linea px-5 py-3 font-display text-lg font-semibold">Altas recientes</h2>
              <ul className="divide-y divide-linea">
                {altas.data.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setAbierta(i.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent/60">
                      <span className="w-40 font-semibold">{i.mascota}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-tinta-suave">{i.motivo}</span>
                      <span className="numeros w-52 whitespace-nowrap text-[14px] text-tinta-suave">
                        {fechaCorta(i.ingreso)} → {fechaCorta(i.egreso!)}
                      </span>
                      <span className="numeros w-28 text-right font-semibold">{pesos(i.totalCentavos)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <DialogoIngreso abierto={ingresando} alCerrar={() => setIngresando(false)} />
      <DialogoFicha internacion={seleccionada} alCerrar={() => setAbierta(null)} />
    </div>
  );
}

function TarjetaInternada({ i, abrir }: { i: Internacion; abrir: () => void }) {
  const ev = i.ultimaEvolucion;
  return (
    <button type="button" onClick={abrir} className="flex h-full w-full flex-col gap-2 rounded-lg border border-linea bg-superficie p-5 text-left outline-none hover:border-acento focus-visible:ring-2 focus-visible:ring-acento/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[22px] leading-tight font-semibold">{i.mascota}</p>
          <p className="text-[14px] text-tinta-suave">
            {NOMBRE_ESPECIE[i.especie]} · {i.dueno}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {i.lugar && (
            <Badge variant="contorno">
              <BedDouble aria-hidden="true" className="size-3.5" />
              {i.lugar}
            </Badge>
          )}
          <span className="numeros text-[13px] text-tinta-suave">
            Día {i.dias} · desde {fechaCorta(i.ingreso)}
          </span>
        </div>
      </div>
      <p className="text-[15px] font-medium">{i.motivo}</p>
      {ev ? (
        <p className="line-clamp-2 text-[14px] text-tinta-suave">
          <span className="numeros">{momentoCorto(ev.momento)}</span> · {ev.texto}
        </p>
      ) : (
        <p className="text-[14px] text-tinta-suave">Todavía sin notas de evolución.</p>
      )}
      <div className="mt-auto flex items-center justify-between pt-1">
        {ev?.temperaturaC != null ? (
          <Badge variant={ev.temperaturaC >= TEMPERATURA_FIEBRE ? 'rojo' : 'contorno'} className="numeros">
            <Thermometer aria-hidden="true" className="size-3.5" />
            {temperaturaLegible(ev.temperaturaC)}
          </Badge>
        ) : (
          <span />
        )}
        <span className="numeros font-semibold">{pesos(i.totalCentavos)}</span>
      </div>
    </button>
  );
}
