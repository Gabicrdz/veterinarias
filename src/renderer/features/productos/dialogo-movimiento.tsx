// Mover el stock de un producto: entrada por compra, merma o ajuste por conteo.
import { useState, type FormEvent } from 'react';
import { esquemaMovimiento } from '@compartido/esquemas';
import { leerPesos } from '@compartido/dinero';
import { cantidadConUnidad } from '@compartido/productos';
import type { Producto } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { leerDecimal } from '@/lib/numeros';
import { useMovimiento } from './consultas-productos';

export type TipoAMover = 'compra' | 'merma' | 'ajuste';
const TEXTOS: Record<TipoAMover, { titulo: string; ayuda: string; cantidad: string }> = {
  compra: { titulo: 'Entrada de mercadería', ayuda: 'Lo que llegó del proveedor: se suma al stock.', cantidad: 'Cuánto llegó' },
  merma: { titulo: 'Merma', ayuda: 'Lo que se rompió, venció o se perdió: se resta del stock.', cantidad: 'Cuánto se perdió' },
  ajuste: { titulo: 'Ajuste por conteo', ayuda: 'Contaste en el local y no coincide: escribí lo que hay, el sistema guarda la diferencia.', cantidad: 'Cuánto hay realmente' },
};

export function DialogoMovimiento({ datos, alCerrar }: { datos: { producto: Producto; tipo: TipoAMover } | null; alCerrar: () => void }) {
  return (
    <Dialog open={datos !== null} onOpenChange={(a) => !a && alCerrar()}>
      {datos && <Formulario producto={datos.producto} tipo={datos.tipo} alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Formulario({ producto, tipo, alCerrar }: { producto: Producto; tipo: TipoAMover; alCerrar: () => void }) {
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const guardar = useMovimiento();
  const t = TEXTOS[tipo];

  function enviar(e: FormEvent) {
    e.preventDefault();
    const n = leerDecimal(cantidad);
    if (n === null || Number.isNaN(n)) return setError('Escribí la cantidad como número (por ejemplo 12 o 2,5).');
    const c = costo.trim() === '' ? null : leerPesos(costo);
    if (costo.trim() !== '' && c === null) return setError('El costo no es válido. Escribilo como 2.800 o 2800,50.');
    const r = esquemaMovimiento.safeParse({ productoId: producto.id, tipo, cantidad: n, costoCentavos: c, motivo });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(r.data, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <DialogContent className="max-w-[500px]">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>
            {t.titulo} · {producto.nombre}
          </DialogTitle>
          <DialogDescription>
            {t.ayuda} Hoy hay <strong>{cantidadConUnidad(producto.stockMilesimas, producto.unidad)}</strong>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Campo etiqueta={`${t.cantidad} (${producto.unidad === 'kg' ? 'kg' : 'unidades'})`} htmlFor="mv-cantidad">
            <Input id="mv-cantidad" autoFocus inputMode="decimal" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setError(''); }} />
          </Campo>
          {tipo === 'compra' && (
            <Campo etiqueta="Costo nuevo (opcional)" htmlFor="mv-costo" ayuda="Si cambió lo que te cobra el proveedor, cargalo y se actualiza el costo.">
              <Input id="mv-costo" inputMode="decimal" value={costo} onChange={(e) => { setCosto(e.target.value); setError(''); }} />
            </Campo>
          )}
          <Campo etiqueta={tipo === 'compra' ? 'Proveedor o nota (opcional)' : 'Motivo (opcional)'} htmlFor="mv-motivo">
            <Input id="mv-motivo" maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
