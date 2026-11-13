// Cobrar un turno: lo que paga el dueño por la consulta y cómo paga. Si ya
// está cobrado, muestra el cobro y permite anularlo.
import { useEffect, useState, type FormEvent } from 'react';
import { esquemaCobro, METODOS, NOMBRE_METODO, type DatosCobro } from '@compartido/esquemas';
import { leerPesos, pesos, pesosParaCampo } from '@compartido/dinero';
import type { MetodoPago, Profesional, Turno } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Confirmar } from '@/features/comun/confirmar';
import { nombreCompleto } from '@/features/profesionales/colores';
import { useAnularCobro, useRegistrarCobro } from '@/features/agenda/consultas-agenda';

type Errores = Partial<Record<'montoCentavos' | 'metodo' | 'general', string>>;

export function DialogoCobro({ turno, profesional, alCerrar }: { turno: Turno | null; profesional: Profesional | undefined; alCerrar: () => void }) {
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [anular, setAnular] = useState(false);
  const registrar = useRegistrarCobro();
  const anularCobro = useAnularCobro();
  const abierto = turno?.id ?? null;

  useEffect(() => {
    if (!turno) return;
    setImporte(profesional?.precioConsultaCentavos ? pesosParaCampo(profesional.precioConsultaCentavos) : '');
    setMetodo(null);
    setErrores({});
    // Solo al abrir otro turno
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!turno) return null;
  const centavos = importe.trim() === '' ? 0 : leerPesos(importe);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (centavos === null) return setErrores({ montoCentavos: 'El importe no es válido. Escribilo como 18.000 o 18000,50.' });
    const datos: DatosCobro = {
      turnoId: turno!.id,
      montoCentavos: centavos,
      metodo: metodo as DatosCobro['metodo'],
    };
    const r = esquemaCobro.safeParse(datos);
    if (!r.success) {
      const nuevos: Errores = {};
      for (const issue of r.error.issues) nuevos[(issue.path[0] as keyof Errores) ?? 'general'] ??= issue.message;
      return setErrores(nuevos);
    }
    registrar.mutate(r.data, { onSuccess: alCerrar, onError: (err) => setErrores({ general: err.message }) });
  }

  const titulo = `Cobro · ${turno.mascota}`;
  const descripcion = `Turno de las ${turno.desde}${profesional ? ` con ${nombreCompleto(profesional)}` : ''}`;

  // Ya cobrado: se muestra y se puede anular
  if (turno.cobro) {
    const c = turno.cobro;
    return (
      <Dialog open onOpenChange={(a) => !a && alCerrar()}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2 text-[15px]">
            <p>
              Pagó el dueño: <strong className="numeros text-2xl">{pesos(c.montoCentavos)}</strong>
              {c.metodo && ` · ${NOMBRE_METODO[c.metodo]}`}
            </p>
            {c.creadoEn && (
              <p className="text-[14px] text-tinta-suave">
                Cobró {c.usuario ?? 'alguien'} el {c.creadoEn.slice(8, 10)}/{c.creadoEn.slice(5, 7)} a las {c.creadoEn.slice(11, 16)}.
              </p>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost-destructive" disabled={anularCobro.isPending} onClick={() => setAnular(true)}>
              Anular cobro
            </Button>
            <Button variant="secondary" onClick={alCerrar}>
              Cerrar
            </Button>
          </DialogFooter>
          <Confirmar
            confirmacion={
              anular
                ? {
                    titulo: '¿Anular este cobro?',
                    descripcion: 'Queda registrado como anulado y el turno vuelve a "sin cobrar", para cobrarlo de nuevo bien.',
                    boton: 'Anular cobro',
                    volver: 'Volver',
                    alConfirmar: () => {
                      setAnular(false);
                      anularCobro.mutate(c.id);
                    },
                  }
                : null
            }
            alCerrar={() => setAnular(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[560px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Campo
              etiqueta="Importe de la consulta"
              htmlFor="co-importe"
              error={errores.montoCentavos}
              ayuda={!profesional?.precioConsultaCentavos ? 'Podés cargar el precio de la consulta en la ficha del veterinario.' : undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-suave">$</span>
                <Input
                  id="co-importe"
                  inputMode="decimal"
                  className="numeros pl-7 text-lg font-semibold"
                  value={importe}
                  onChange={(e) => {
                    setImporte(e.target.value);
                    setErrores({});
                  }}
                />
              </div>
            </Campo>

            {(
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Cómo paga</legend>
                <div role="radiogroup" aria-label="Cómo paga" className="grid grid-cols-4 gap-2">
                  {METODOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={metodo === m}
                      onClick={() => {
                        setMetodo(m);
                        setErrores({});
                      }}
                      className={cn(
                        'h-11 rounded-md border text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                        metodo === m ? 'border-acento bg-acento text-white' : 'border-linea-fuerte hover:bg-accent',
                      )}
                    >
                      {NOMBRE_METODO[m]}
                    </button>
                  ))}
                </div>
                {errores.metodo && (
                  <p role="alert" className="mt-2 text-[13px] font-medium text-rojo">
                    {errores.metodo}
                  </p>
                )}
              </fieldset>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <p role="alert" className="text-[14px] font-medium text-rojo">
              {errores.general}
            </p>
            <div className="flex items-center gap-3">
              <span className="numeros text-[15px] text-tinta-suave">
                Paga: <strong className="text-tinta">{pesos(centavos ?? 0)}</strong>
              </span>
              <Button type="submit" disabled={registrar.isPending}>
                Registrar cobro
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
