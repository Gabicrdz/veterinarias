// Alta y edición de un producto (solo administración). El stock no se edita acá:
// se mueve con entradas, mermas y ajustes, así queda el historial de cada cambio.
import { useState, type FormEvent } from 'react';
import { esquemaProducto, type DatosProducto } from '@compartido/esquemas';
import { leerPesos, pesosParaCampo } from '@compartido/dinero';
import { CATEGORIAS_PRODUCTO, NOMBRE_CATEGORIA, NOMBRE_UNIDAD, UNIDADES, cantidadLegible, type CategoriaProducto, type Unidad } from '@compartido/productos';
import type { Producto } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { leerDecimal } from '@/lib/numeros';
import { useGuardarProducto } from './consultas-productos';

/** `null` = cerrado · `'nuevo'` = alta · un producto = edición. */
export type ProductoAEditar = Producto | 'nuevo' | null;

export function DialogoProducto({ producto, alCerrar }: { producto: ProductoAEditar; alCerrar: () => void }) {
  return (
    <Dialog open={producto !== null} onOpenChange={(a) => !a && alCerrar()}>
      {producto && <Formulario producto={producto === 'nuevo' ? null : producto} alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Formulario({ producto, alCerrar }: { producto: Producto | null; alCerrar: () => void }) {
  const [f, setF] = useState({
    codigo: producto?.codigo ?? '',
    nombre: producto?.nombre ?? '',
    categoria: (producto?.categoria ?? 'alimento') as CategoriaProducto,
    unidad: (producto?.unidad ?? 'unidad') as Unidad,
    costo: producto ? pesosParaCampo(producto.costoCentavos) : '',
    precio: producto ? pesosParaCampo(producto.precioCentavos) : '',
    minimo: producto ? cantidadLegible(producto.stockMinimoMilesimas).replace('.', '') : '',
    inicial: '',
  });
  const [error, setError] = useState('');
  const guardar = useGuardarProducto();
  const poner = (campo: keyof typeof f) => (valor: string) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setError('');
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const costo = f.costo.trim() === '' ? 0 : leerPesos(f.costo);
    const precio = leerPesos(f.precio);
    if (costo === null) return setError('El costo no es válido. Escribilo como 2.800 o 2800,50.');
    if (precio === null) return setError('Escribí el precio de venta (por ejemplo 3.800).');
    const minimo = leerDecimal(f.minimo) ?? 0;
    const inicial = leerDecimal(f.inicial) ?? 0;
    if (Number.isNaN(minimo) || Number.isNaN(inicial)) return setError('Las cantidades tienen que ser números (por ejemplo 12 o 2,5).');
    const datos: DatosProducto = {
      id: producto?.id,
      codigo: f.codigo,
      nombre: f.nombre,
      categoria: f.categoria,
      unidad: f.unidad,
      costoCentavos: costo,
      precioCentavos: precio,
      stockMinimo: minimo,
      stockInicial: producto ? 0 : inicial,
    };
    // Se valida acá para avisar al lado del campo; el main vuelve a validar igual
    const r = esquemaProducto.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  const porKilo = f.unidad === 'kg';
  return (
    <DialogContent className="max-w-[620px]">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>{producto ? `Editar · ${producto.nombre}` : 'Producto nuevo'}</DialogTitle>
          <DialogDescription>
            {producto ? 'Cambiar el precio no modifica las ventas ya hechas. Para mover el stock usá Entrada, Merma o Ajuste.' : 'Si lo vas a vender por kilo suelto, elegí "Por kilo" y cargá el precio de cada kilo.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Nombre" htmlFor="pr-nombre" className="col-span-2">
            <Input id="pr-nombre" autoFocus maxLength={80} value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} />
          </Campo>
          <Campo etiqueta="Categoría" htmlFor="pr-categoria">
            <Select value={f.categoria} onValueChange={(v) => poner('categoria')(v)}>
              <SelectTrigger id="pr-categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_PRODUCTO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {NOMBRE_CATEGORIA[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Se vende" htmlFor="pr-unidad">
            <Select value={f.unidad} onValueChange={(v) => poner('unidad')(v)}>
              <SelectTrigger id="pr-unidad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => (
                  <SelectItem key={u} value={u}>
                    {NOMBRE_UNIDAD[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta={porKilo ? 'Costo por kilo ($)' : 'Costo ($)'} htmlFor="pr-costo" ayuda="Lo que te cuesta a vos: sirve para calcular la ganancia.">
            <Input id="pr-costo" inputMode="decimal" value={f.costo} onChange={(e) => poner('costo')(e.target.value)} />
          </Campo>
          <Campo etiqueta={porKilo ? 'Precio por kilo ($)' : 'Precio de venta ($)'} htmlFor="pr-precio">
            <Input id="pr-precio" inputMode="decimal" value={f.precio} onChange={(e) => poner('precio')(e.target.value)} />
          </Campo>
          <Campo etiqueta={porKilo ? 'Avisar con menos de (kg)' : 'Avisar con menos de (unidades)'} htmlFor="pr-minimo" ayuda="0 = no avisar.">
            <Input id="pr-minimo" inputMode="decimal" value={f.minimo} onChange={(e) => poner('minimo')(e.target.value)} />
          </Campo>
          {!producto && (
            <Campo etiqueta={porKilo ? 'Stock inicial (kg)' : 'Stock inicial (unidades)'} htmlFor="pr-inicial" ayuda="Lo que tenés hoy en el local.">
              <Input id="pr-inicial" inputMode="decimal" value={f.inicial} onChange={(e) => poner('inicial')(e.target.value)} />
            </Campo>
          )}
          <Campo etiqueta="Código de barras (opcional)" htmlFor="pr-codigo" ayuda="Con un lector, el mostrador lo encuentra solo.">
            <Input id="pr-codigo" maxLength={40} value={f.codigo} onChange={(e) => poner('codigo')(e.target.value)} />
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
