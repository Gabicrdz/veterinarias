// Productos: lo que se vende en el mostrador, con su stock. Se ve cuánto queda,
// qué hay que reponer y qué movimientos tuvo cada producto.
import { useState } from 'react';
import { PackagePlus, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { pesos } from '@compartido/dinero';
import { CATEGORIAS_PRODUCTO, NOMBRE_CATEGORIA, NOMBRE_ESTADO_STOCK, NOMBRE_MOVIMIENTO, cantidadConUnidad, type CategoriaProducto } from '@compartido/productos';
import type { Producto } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fechaCorta } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { useDemorado } from '@/features/comun/consultas';
import { useUsuario } from '@/features/sesion/consultas';
import { DialogoMovimiento, type TipoAMover } from './dialogo-movimiento';
import { DialogoProducto, type ProductoAEditar } from './dialogo-producto';
import { useCambiarActivo, useCargarProductosEjemplo, useMovimientos, useProductos } from './consultas-productos';

type Estado = 'todos' | 'bajo' | 'sin_stock';
const ESTADOS: { valor: Estado; nombre: string }[] = [
  { valor: 'todos', nombre: 'Todos' },
  { valor: 'bajo', nombre: 'Stock bajo' },
  { valor: 'sin_stock', nombre: 'Sin stock' },
];

export function InsigniaStock({ p }: { p: Pick<Producto, 'estado'> }) {
  if (p.estado === 'ok') return null;
  return <Badge variant={p.estado === 'sin_stock' ? 'rojo' : 'acento'}>{NOMBRE_ESTADO_STOCK[p.estado]}</Badge>;
}

export function PaginaProductos() {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado>('todos');
  const [categoria, setCategoria] = useState<CategoriaProducto | 'todas'>('todas');
  const [bajas, setBajas] = useState(false);
  const [ficha, setFicha] = useState<number | null>(null);
  const [editar, setEditar] = useState<ProductoAEditar>(null);
  const [mover, setMover] = useState<{ producto: Producto; tipo: TipoAMover } | null>(null);
  const { esAdmin } = useUsuario();
  const buscado = useDemorado(texto);
  const productos = useProductos({ texto: buscado, categoria: categoria === 'todas' ? null : categoria, estado, incluirBajas: bajas });
  const todos = useProductos({ texto: '', categoria: null, estado: 'todos', incluirBajas: false });
  const ejemplo = useCargarProductosEjemplo();

  const lista = productos.data ?? [];
  const hayAlgo = (todos.data?.length ?? 0) > 0 || bajas;
  const seleccionado = lista.find((p) => p.id === ficha) ?? null;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Productos" detalle="Alimento, medicamentos y accesorios del mostrador, con su stock.">
        {esAdmin && (
          <Button onClick={() => setEditar('nuevo')}>
            <Plus aria-hidden="true" />
            Producto nuevo
          </Button>
        )}
      </Encabezado>

      {productos.isError ? (
        <p role="alert" className="font-medium text-rojo">
          No se pudieron cargar los productos: {productos.error.message}
        </p>
      ) : !productos.data ? (
        <p className="text-tinta-suave">Cargando…</p>
      ) : !hayAlgo ? (
        <Vacio
          titulo="Todavía no hay productos"
          acciones={
            esAdmin ? (
              <>
                <Button onClick={() => setEditar('nuevo')}>Cargar el primero</Button>
                <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate(undefined, { onError: (e) => toast.error(e.message) })}>
                  Cargar productos de ejemplo
                </Button>
              </>
            ) : undefined
          }
        >
          Cargá lo que vendés (alimento, pipetas, shampoo…) con su precio y su stock. Después se vende desde el Mostrador.
        </Vacio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-tinta-suave" />
              <Input aria-label="Buscar producto" placeholder="Buscar por nombre o código" className="pl-10" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaProducto | 'todas')}>
              <SelectTrigger aria-label="Categoría" className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {CATEGORIAS_PRODUCTO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {NOMBRE_CATEGORIA[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div role="group" aria-label="Filtrar por stock" className="flex flex-wrap items-center gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e.valor}
                type="button"
                aria-pressed={estado === e.valor}
                onClick={() => setEstado(e.valor)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                  estado === e.valor ? 'border-acento bg-acento-suave font-semibold text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent hover:text-tinta',
                )}
              >
                {e.nombre}
              </button>
            ))}
            {esAdmin && (
              <label className="ml-auto flex items-center gap-2 text-[14px] text-tinta-suave">
                <input type="checkbox" checked={bajas} onChange={(e) => setBajas(e.target.checked)} />
                Ver dados de baja
              </label>
            )}
          </div>

          {lista.length === 0 ? (
            <Vacio titulo="No hay productos así">Probá con otra búsqueda o con otro filtro.</Vacio>
          ) : (
            <section aria-label="Productos" className="rounded-lg border border-linea bg-superficie">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-medium text-tinta-suave">
                    <th className="px-5 py-3 font-medium">Producto</th>
                    <th className="py-3 font-medium">Categoría</th>
                    <th className="py-3 text-right font-medium">Precio</th>
                    <th className="px-5 py-3 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id} className={cn('cursor-pointer border-b border-linea last:border-b-0 hover:bg-accent/60', !p.activo && 'opacity-60')} onClick={() => setFicha(p.id)}>
                      <td className="px-5 py-3">
                        <button type="button" className="text-left font-semibold outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); setFicha(p.id); }}>
                          {p.nombre}
                        </button>
                        {p.codigo && <p className="numeros text-[13px] text-tinta-suave">{p.codigo}</p>}
                      </td>
                      <td className="py-3 text-tinta-suave">{NOMBRE_CATEGORIA[p.categoria]}</td>
                      <td className="numeros py-3 text-right">
                        {pesos(p.precioCentavos)}
                        {p.unidad === 'kg' && <span className="text-[13px] text-tinta-suave"> /kg</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {!p.activo ? <Badge variant="contorno">De baja</Badge> : <InsigniaStock p={p} />}
                          <span className="numeros w-20 text-right font-semibold">{cantidadConUnidad(p.stockMilesimas, p.unidad)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      <Ficha producto={seleccionado} alCerrar={() => setFicha(null)} editar={setEditar} mover={setMover} />
      <DialogoProducto producto={editar} alCerrar={() => setEditar(null)} />
      <DialogoMovimiento datos={mover} alCerrar={() => setMover(null)} />
    </div>
  );
}

function Ficha({
  producto,
  alCerrar,
  editar,
  mover,
}: {
  producto: Producto | null;
  alCerrar: () => void;
  editar: (p: Producto) => void;
  mover: (m: { producto: Producto; tipo: TipoAMover }) => void;
}) {
  const { esAdmin } = useUsuario();
  const movimientos = useMovimientos(producto?.id ?? null);
  const cambiar = useCambiarActivo();
  return (
    <Dialog open={producto !== null} onOpenChange={(a) => !a && alCerrar()}>
      {producto && (
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{producto.nombre}</DialogTitle>
            <DialogDescription>
              {NOMBRE_CATEGORIA[producto.categoria]} · {pesos(producto.precioCentavos)}
              {producto.unidad === 'kg' ? ' por kilo' : ''}
              {esAdmin && ` · costo ${pesos(producto.costoCentavos)}`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <p className="flex items-center gap-3">
              <span className="numeros font-display text-3xl font-semibold">{cantidadConUnidad(producto.stockMilesimas, producto.unidad)}</span>
              <span className="text-tinta-suave">en stock</span>
              <InsigniaStock p={producto} />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!producto.activo} onClick={() => mover({ producto, tipo: 'compra' })}>
                <PackagePlus aria-hidden="true" />
                Entrada
              </Button>
              {esAdmin && (
                <>
                  <Button size="sm" variant="outline" disabled={!producto.activo} onClick={() => mover({ producto, tipo: 'merma' })}>
                    Merma
                  </Button>
                  <Button size="sm" variant="outline" disabled={!producto.activo} onClick={() => mover({ producto, tipo: 'ajuste' })}>
                    Ajuste por conteo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editar(producto)}>
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                </>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-tinta-suave">Últimos movimientos</h3>
              {!movimientos.data ? (
                <p className="text-tinta-suave">Cargando…</p>
              ) : (
                <ul className="divide-y divide-linea rounded-md border border-linea">
                  {movimientos.data.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-[14px]">
                      <span className="numeros w-24 shrink-0 text-tinta-suave">{fechaCorta(m.fecha)}</span>
                      <span className="flex-1">
                        {NOMBRE_MOVIMIENTO[m.tipo]}
                        {m.motivo && <span className="text-tinta-suave"> · {m.motivo}</span>}
                        {m.usuario && <span className="text-tinta-suave"> · {m.usuario}</span>}
                      </span>
                      <span className={cn('numeros font-semibold', m.cantidadMilesimas < 0 ? 'text-rojo' : 'text-verde')}>
                        {m.cantidadMilesimas > 0 ? '+' : '−'}
                        {cantidadConUnidad(Math.abs(m.cantidadMilesimas), producto.unidad)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {esAdmin ? (
              <Button variant={producto.activo ? 'ghost-destructive' : 'outline'} disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: producto.id, activo: !producto.activo })}>
                {producto.activo ? 'Dar de baja' : 'Reactivar'}
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={alCerrar}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
