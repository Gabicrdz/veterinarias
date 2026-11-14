// Internar una mascota: quién es, por qué, dónde queda y cuánto se cobra por día.
import { useState, type FormEvent } from 'react';
import { esquemaIngreso } from '@compartido/esquemas';
import { leerPesos } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BuscadorMascota, type MascotaElegido } from '@/features/agenda/buscador-mascota';
import { useProfesionales } from '@/features/comun/consultas';
import { nombreCompleto } from '@/features/profesionales/colores';
import { useIngresar } from './consultas-internacion';

export function DialogoIngreso({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      {abierto && <Formulario alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Formulario({ alCerrar }: { alCerrar: () => void }) {
  const [mascota, setMascota] = useState<MascotaElegido | null>(null);
  const [f, setF] = useState({ motivo: '', lugar: '', veterinario: 'ninguno', tarifa: '' });
  const [error, setError] = useState('');
  const profesionales = useProfesionales();
  const guardar = useIngresar();
  const poner = (campo: keyof typeof f) => (valor: string) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setError('');
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!mascota) return setError('Elegí la mascota que se interna.');
    const tarifa = f.tarifa.trim() === '' ? 0 : leerPesos(f.tarifa);
    if (tarifa === null) return setError('La tarifa no es válida. Escribila como 15.000 o 15000.');
    const datos = { mascotaId: mascota.id, motivo: f.motivo, lugar: f.lugar, profesionalId: f.veterinario === 'ninguno' ? null : Number(f.veterinario), tarifaDiariaCentavos: tarifa };
    const r = esquemaIngreso.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <DialogContent className="max-w-[560px]">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>Internar una mascota</DialogTitle>
          <DialogDescription>Queda en la lista de internadas, con sus notas de evolución. Los días se cobran al dar el alta.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Campo etiqueta="Mascota">
            <BuscadorMascota valor={mascota} alElegir={(m) => { setMascota(m); setError(''); }} />
          </Campo>
          <Campo etiqueta="Motivo" htmlFor="in-motivo">
            <Input id="in-motivo" maxLength={200} placeholder="Por ejemplo: gastroenteritis, suero y control" value={f.motivo} onChange={(e) => poner('motivo')(e.target.value)} />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Jaula o lugar (opcional)" htmlFor="in-lugar">
              <Input id="in-lugar" maxLength={40} placeholder="Jaula 3" value={f.lugar} onChange={(e) => poner('lugar')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Tarifa por día ($)" htmlFor="in-tarifa" ayuda="Vacío = sin cargo.">
              <Input id="in-tarifa" inputMode="decimal" value={f.tarifa} onChange={(e) => poner('tarifa')(e.target.value)} />
            </Campo>
          </div>
          <Campo etiqueta="Veterinario a cargo (opcional)" htmlFor="in-vet">
            <Select value={f.veterinario} onValueChange={poner('veterinario')}>
              <SelectTrigger id="in-vet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin asignar</SelectItem>
                {(profesionales.data ?? []).filter((p) => p.activo).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {nombreCompleto(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
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
              Internar
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
