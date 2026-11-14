// La ficha de una internación: notas de evolución (con temperatura) y el alta con cobro.
import { useState, type FormEvent } from 'react';
import { esquemaEvolucion } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { Internacion, MetodoPago } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fechaCorta } from '@/lib/fechas';
import { leerDecimal, TEMPERATURA_FIEBRE, temperaturaLegible } from '@/lib/numeros';
import { cn } from '@/lib/utils';
import { SelectorMetodo } from '@/features/comun/selector-metodo';
import { useDarAlta, useEvoluciones, useEvolucionar } from './consultas-internacion';

export const momentoCorto = (momento: string) => `${fechaCorta(momento.slice(0, 10))} ${momento.slice(11, 16)}`;

export function DialogoFicha({ internacion, alCerrar }: { internacion: Internacion | null; alCerrar: () => void }) {
  return (
    <Dialog open={internacion !== null} onOpenChange={(a) => !a && alCerrar()}>
      {internacion && <Ficha i={internacion} alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Ficha({ i, alCerrar }: { i: Internacion; alCerrar: () => void }) {
  const internada = i.egreso === null;
  const evoluciones = useEvoluciones(i.id);
  const evolucionar = useEvolucionar();
  const alta = useDarAlta();
  const [texto, setTexto] = useState('');
  const [temp, setTemp] = useState('');
  const [errorNota, setErrorNota] = useState('');
  const [altando, setAltando] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [errorAlta, setErrorAlta] = useState('');

  function agregarNota(e: FormEvent) {
    e.preventDefault();
    const t = temp.trim() === '' ? null : leerDecimal(temp);
    if (t !== null && Number.isNaN(t)) return setErrorNota('La temperatura tiene que ser un número (por ejemplo 38,5).');
    const datos = { internacionId: i.id, texto, temperaturaC: t };
    const r = esquemaEvolucion.safeParse(datos);
    if (!r.success) return setErrorNota(r.error.issues[0]?.message ?? 'Revisá los datos.');
    evolucionar.mutate(datos, {
      onSuccess: () => {
        setTexto('');
        setTemp('');
        setErrorNota('');
      },
      onError: (err) => setErrorNota(err.message),
    });
  }

  function confirmarAlta() {
    if (i.totalCentavos > 0 && !metodo) return setErrorAlta('Elegí cómo paga.');
    alta.mutate({ internacionId: i.id, metodo: i.totalCentavos > 0 ? metodo : null }, { onSuccess: alCerrar, onError: (err) => setErrorAlta(err.message) });
  }

  return (
    <DialogContent className="max-w-[680px]">
      <DialogHeader>
        <DialogTitle>
          {i.mascota} <span className="font-sans text-[15px] font-normal text-tinta-suave">· {NOMBRE_ESPECIE[i.especie]} · {i.dueno}</span>
        </DialogTitle>
        <DialogDescription>
          {i.motivo}
          {i.lugar && ` · ${i.lugar}`}
          {i.profesional && ` · ${i.profesional}`}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-5">
        <dl className="grid grid-cols-3 gap-4 rounded-lg border border-linea bg-fondo/60 p-4">
          <div>
            <dt className="text-[13px] text-tinta-suave">{internada ? 'Ingresó' : 'Estuvo'}</dt>
            <dd className="numeros font-semibold">{internada ? fechaCorta(i.ingreso) : `${fechaCorta(i.ingreso)} → ${fechaCorta(i.egreso!)}`}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-tinta-suave">Días</dt>
            <dd className="numeros font-semibold">
              {i.dias} {i.dias === 1 ? 'día' : 'días'}
              {i.tarifaDiariaCentavos > 0 && <span className="font-normal text-tinta-suave"> × {pesos(i.tarifaDiariaCentavos)}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-tinta-suave">{internada ? 'Lleva acumulado' : 'Se cobró'}</dt>
            <dd className="numeros font-display text-xl font-semibold">{pesos(i.totalCentavos)}</dd>
          </div>
        </dl>

        {internada && (
          <form onSubmit={agregarNota} noValidate className="flex flex-col gap-2">
            <label htmlFor="ev-texto" className="text-[14px] font-medium">
              Nota de evolución
            </label>
            <Textarea id="ev-texto" rows={3} maxLength={600} placeholder="Cómo está hoy, qué se le dio, qué falta…" value={texto} onChange={(e) => { setTexto(e.target.value); setErrorNota(''); }} />
            <div className="flex items-center gap-3">
              <Input aria-label="Temperatura en grados (opcional)" placeholder="Temp. °C" inputMode="decimal" className="numeros w-28" value={temp} onChange={(e) => { setTemp(e.target.value); setErrorNota(''); }} />
              <p role="alert" className="flex-1 text-[14px] font-medium text-rojo">
                {errorNota}
              </p>
              <Button type="submit" size="sm" disabled={evolucionar.isPending}>
                Agregar nota
              </Button>
            </div>
          </form>
        )}

        <div>
          <h3 className="mb-2 text-[13px] font-medium text-tinta-suave">Evolución</h3>
          {!evoluciones.data ? (
            <p className="text-tinta-suave">Cargando…</p>
          ) : evoluciones.data.length === 0 ? (
            <p className="text-tinta-suave">Todavía no hay notas.</p>
          ) : (
            <ul className="divide-y divide-linea rounded-md border border-linea">
              {evoluciones.data.map((e) => (
                <li key={e.id} className="flex gap-3 px-3 py-2.5 text-[14px]">
                  <span className="numeros w-[104px] shrink-0 text-tinta-suave">{momentoCorto(e.momento)}</span>
                  <span className="flex-1">
                    {e.texto}
                    {e.usuario && <span className="text-tinta-suave"> · {e.usuario}</span>}
                  </span>
                  {e.temperaturaC !== null && (
                    <Badge variant={e.temperaturaC >= TEMPERATURA_FIEBRE ? 'rojo' : 'contorno'} className="numeros h-fit">
                      {temperaturaLegible(e.temperaturaC)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {internada && altando && (
          <section aria-label="Dar el alta" className="flex flex-col gap-3 rounded-lg border border-acento/40 bg-acento-suave/40 p-4">
            <p className="font-semibold">
              Dar el alta a {i.mascota}: {i.dias} {i.dias === 1 ? 'día' : 'días'} · <span className="numeros">{pesos(i.totalCentavos)}</span>
            </p>
            {i.totalCentavos > 0 ? <SelectorMetodo valor={metodo} alCambiar={(m) => { setMetodo(m); setErrorAlta(''); }} /> : <p className="text-tinta-suave">Sin cargo: no hace falta elegir cómo paga.</p>}
            <p role="alert" className="min-h-5 text-[14px] font-medium text-rojo">
              {errorAlta}
            </p>
            <div className="flex gap-2">
              <Button disabled={alta.isPending} onClick={confirmarAlta}>
                {i.totalCentavos > 0 ? `Cobrar ${pesos(i.totalCentavos)} y dar el alta` : 'Dar el alta'}
              </Button>
              <Button variant="outline" onClick={() => setAltando(false)}>
                Volver
              </Button>
            </div>
          </section>
        )}
      </DialogBody>
      <DialogFooter>
        {internada && !altando && <Button onClick={() => setAltando(true)}>Dar el alta</Button>}
        <Button variant="secondary" className={cn(internada && !altando && 'ml-auto')} onClick={alCerrar}>
          Cerrar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
