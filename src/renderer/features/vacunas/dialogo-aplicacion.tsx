// Registrar una vacuna o desparasitación en el carnet. Se elige una de las más comunes
// (que propone la próxima fecha) o se escribe cualquier otra.
import { useState, type FormEvent } from 'react';
import { esquemaAplicacion } from '@compartido/esquemas';
import type { Especie } from '@compartido/tipos';
import { NOMBRE_TIPO, TIPOS_APLICACION, sugeridasDe, sumarMeses, type TipoAplicacion } from '@compartido/vacunas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { useRegistrarAplicacion } from './consultas-vacunas';

interface Props {
  mascota: { id: number; nombre: string; especie: Especie } | null;
  alCerrar: () => void;
}

const vacio = () => ({ tipo: 'vacuna' as TipoAplicacion, nombre: '', fecha: fechaISO(), proximaDosis: '', lote: '', notas: '', cadaMeses: 12 });

export function DialogoAplicacion({ mascota, alCerrar }: Props) {
  return (
    <Dialog open={mascota !== null} onOpenChange={(a) => !a && alCerrar()}>
      {mascota && <Formulario mascota={mascota} alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Formulario({ mascota, alCerrar }: { mascota: NonNullable<Props['mascota']>; alCerrar: () => void }) {
  const [f, setF] = useState(vacio);
  const [error, setError] = useState('');
  const guardar = useRegistrarAplicacion();
  const sugeridas = sugeridasDe(mascota.especie);

  const poner = <K extends keyof ReturnType<typeof vacio>>(campo: K) => (valor: ReturnType<typeof vacio>[K]) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setError('');
  };

  // Al elegir una sugerida se completan el tipo, el nombre y la próxima fecha (todo se puede cambiar)
  function elegir(s: (typeof sugeridas)[number]) {
    setF((v) => ({ ...v, tipo: s.tipo, nombre: s.nombre, cadaMeses: s.cadaMeses, proximaDosis: v.fecha ? sumarMeses(v.fecha, s.cadaMeses) : '' }));
    setError('');
  }
  // Si cambia la fecha de aplicación y la próxima venía propuesta, se corre con ella
  function cambiarFecha(fecha: string) {
    setF((v) => ({ ...v, fecha, proximaDosis: v.proximaDosis && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && v.proximaDosis === sumarMeses(v.fecha, v.cadaMeses) ? sumarMeses(fecha, v.cadaMeses) : v.proximaDosis }));
    setError('');
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaAplicacion.safeParse({ mascotaId: mascota.id, tipo: f.tipo, nombre: f.nombre, fecha: f.fecha, proximaDosis: f.proximaDosis || null, lote: f.lote, notas: f.notas });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(r.data, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <DialogContent className="max-w-[620px]">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>Registrar aplicación · {mascota.nombre}</DialogTitle>
          <DialogDescription>Elegí una de las más comunes o escribí otra. Los plazos son una referencia: el veterinario decide.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <div role="group" aria-label="Más comunes" className="flex flex-wrap gap-2">
            {sugeridas.map((s) => (
              <button
                key={s.nombre}
                type="button"
                aria-pressed={f.nombre === s.nombre}
                onClick={() => elegir(s)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                  f.nombre === s.nombre ? 'border-acento bg-acento-suave font-semibold text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent hover:text-tinta',
                )}
              >
                {s.nombre}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1.6fr] gap-4">
            <Campo etiqueta="Tipo" htmlFor="ap-tipo">
              <Select value={f.tipo} onValueChange={(v) => poner('tipo')(v as TipoAplicacion)}>
                <SelectTrigger id="ap-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_APLICACION.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NOMBRE_TIPO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Qué se aplicó" htmlFor="ap-nombre">
              <Input id="ap-nombre" maxLength={60} autoFocus value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de aplicación" htmlFor="ap-fecha">
              <Input id="ap-fecha" type="date" max={fechaISO()} value={f.fecha} onChange={(e) => cambiarFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Próxima dosis (opcional)" htmlFor="ap-proxima" ayuda="Es la fecha en que se le avisa al dueño. Vacía = no hay próxima.">
              <Input id="ap-proxima" type="date" min={f.fecha || undefined} value={f.proximaDosis} onChange={(e) => poner('proximaDosis')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Lote (opcional)" htmlFor="ap-lote">
              <Input id="ap-lote" maxLength={40} value={f.lote} onChange={(e) => poner('lote')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas (opcional)" htmlFor="ap-notas">
              <Input id="ap-notas" maxLength={200} value={f.notas} onChange={(e) => poner('notas')(e.target.value)} />
            </Campo>
          </div>
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          <p role="alert" className="text-[14px] font-medium text-rojo">
            {error}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
