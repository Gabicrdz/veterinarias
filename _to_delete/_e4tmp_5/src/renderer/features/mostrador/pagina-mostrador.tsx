// Mostrador: la venta rápida de alimento y productos. Se busca (o se pasa el código de barras),
// se arma el carrito, se elige cómo paga y se cobra. El stock baja solo.
import { useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { METODOS, NOMBRE_METODO } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import { NOMBRE_CATEGORIA, aMilesimas, cantidadConUnidad, cantidadLegible, subtotalDe } from '@compartido/productos';
import type { MetodoPago, Producto, Venta } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fechaISO } from '@/lib/fechas';
import { leerDecimal } from '@/lib/numeros';
import { cn } from '@/lib/utils';
import { Confirmar } from '@/features/comun/confirmar';
import { useDemorado } from '@/features/comun/consultas';
import { Encabezado } from '@/features/comun/encabezado';
import { InsigniaStock } from '@/features/productos/pagina-productos';
import { useAnularVenta, useProductos, useRegistrarVenta, useVentasDelDia } from '@/features/productos/consultas-productos';

interface Renglon {
  producto: Producto;
  /** Lo que se escribe en el campo ("1,5"); se valida al cobrar. */
  cantidad: string;
}

export function PaginaMostrador() {
  const [texto, setTexto] = useState('');
  const [carrito, setCarrito] = useState<Renglon[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [error, setError] = useState('');
  const [anular, setAnular] = useState<Venta | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const buscado = useDemorado(texto, 150);
  const resultados = useProductos({ texto: buscado, categoria: null, estado: 'todos', incluirBajas: false });
  const hoy = fechaISO();
  const ventas = useVentasDelDia(hoy);
  const vender = useRegistrarVenta();
  const anularVenta = useAnularVenta();

  const lista = resultados.data ?? [];
  const cantidades = carrito.map((r) => leerDecimal(r.cantidad));
  const invalida = cantidades.some((c) => c === null || Number.isNaN(c) || c <= 0);
  const total = useMemo(
    () => carrito.reduce((suma, r, i) => suma + (cantidades[i] && !Number.isNaN(cantidades[i]) ? subtotalDe(aMilesimas(cantidades[i]!), r.producto.precioCentavos) : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrito],
  );

  function agregar(p: Producto) {
    if (p.stockMilesimas <= 0) return toast.error(`No queda stock de ${p.nombre}.`);
    setError('');
    setCarrito((c) => {
      const i = c.findIndex((r) => r.producto.id === p.id);
      if (i === -1) return [...c, { producto: p, cantidad: '1' }];
      // Ya estaba: se suma 1 (un kilo o una unidad)
      return c.map((r, j) => (j === i ? { ...r, cantidad: String((leerDecimal(r.cantidad) || 0) + 1).replace('.', ',') } : r));
    });
    setTexto('');
    buscador.current?.focus();
  }

  // Enter: el código de barras exacto (lector) o el único resultado
  function alEnter() {
    const t = texto.trim();
    if (!t) return;
    const exacto = lista.find((p) => p.codigo === t);
    if (exacto) return agregar(exacto);
    if (lista.length === 1 && buscado === t) agregar(lista[0]!);
  }

  const cambiarCantidad = (i: number, cantidad: string) => {
    setCarrito((c) => c.map((r, j) => (j === i ? { ...r, cantidad } : r)));
    setError('');
  };
  const sumar = (i: number, delta: number) => {
    const actual = leerDecimal(carrito[i]!.cantidad);
    const siguiente = Math.max(0, (actual && !Number.isNaN(actual) ? actual : 0) + delta);
    cambiarCantidad(i, String(siguiente).replace('.', ','));
  };

  function cobrar() {
    if (carrito.length === 0) return setError('Agregá al menos un producto.');
    if (invalida) return setError('Revisá las cantidades: tienen que ser mayores que cero.');
    if (!metodo) return setError('Elegí cómo paga.');
    const items = carrito.map((r, i) => ({ productoId: r.producto.id, cantidad: cantidades[i]! }));
    vender.mutate(
      { items, metodo },
      {
        onSuccess: () => {
          setCarrito([]);
          setMetodo(null);
          setError('');
          buscador.current?.focus();
        },
        onError: (e) => setError(e.message),
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Mostrador" detalle="Vendé alimento y productos: el stock baja solo.">
        {ventas.data && (
          <p className="numeros text-[15px] text-tinta-suave">
            Hoy: <strong className="text-tinta">{pesos(ventas.data.totalCentavos)}</strong> en {ventas.data.cantidad} {ventas.data.cantidad === 1 ? 'venta' : 'ventas'}
          </p>
        )}
      </Encabezado>

      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-6">
        <section aria-label="Productos para vender" className="flex flex-col gap-3">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-tinta-suave" />
            <Input
              ref={buscador}
              autoFocus
              aria-label="Buscar producto o pasar el código de barras"
              placeholder="Buscar por nombre o pasar el código de barras"
              className="h-12 pl-10 text-[16px]"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), alEnter())}
            />
          </div>
          {resultados.isError ? (
            <p role="alert" className="font-medium text-rojo">
              {resultados.error.message}
            </p>
          ) : lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linea-fuerte px-6 py-10 text-center text-tinta-suave">
              {resultados.data ? 'No hay productos así. Los productos nuevos los carga administración en Productos.' : 'Cargando…'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {lista.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={p.stockMilesimas <= 0}
                    onClick={() => agregar(p)}
                    className="flex h-full w-full flex-col items-start gap-1 rounded-lg border border-linea bg-superficie p-3 text-left outline-none hover:border-acento hover:bg-acento-suave/40 focus-visible:ring-2 focus-visible:ring-acento/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-linea disabled:hover:bg-superficie"
                  >
                    <span className="font-semibold leading-tight">{p.nombre}</span>
                    <span className="text-[13px] text-tinta-suave">{NOMBRE_CATEGORIA[p.categoria]}</span>
                    <span className="mt-1 flex w-full items-center justify-between gap-2">
                      <span className="numeros font-display text-[18px] font-semibold">
                        {pesos(p.precioCentavos)}
                        {p.unidad === 'kg' && <span className="font-sans text-[13px] font-normal text-tinta-suave"> /kg</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <InsigniaStock p={p} />
                        <span className="numeros text-[13px] text-tinta-suave">{cantidadConUnidad(p.stockMilesimas, p.unidad)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Venta actual" className="flex flex-col gap-4 rounded-lg border border-linea bg-superficie p-5">
          <h2 className="font-display text-xl font-semibold">Venta actual</h2>
          {carrito.length === 0 ? (
            <p className="py-6 text-center text-tinta-suave">Tocá un producto para agregarlo.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {carrito.map((r, i) => {
                const n = cantidades[i];
                const ok = n !== null && n !== undefined && !Number.isNaN(n) && n > 0;
                return (
                  <li key={r.producto.id} className="flex flex-col gap-2 py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold leading-tight">{r.producto.nombre}</p>
                      <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${r.producto.nombre}`} onClick={() => setCarrito((c) => c.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Button size="icon-sm" variant="outline" aria-label="Menos" onClick={() => sumar(i, r.producto.unidad === 'kg' ? -0.5 : -1)}>
                          <Minus aria-hidden="true" />
                        </Button>
                        <Input
                          aria-label={`Cantidad de ${r.producto.nombre}${r.producto.unidad === 'kg' ? ' en kilos' : ''}`}
                          inputMode="decimal"
                          className={cn('numeros h-9 w-20 text-center', !ok && 'border-rojo')}
                          value={r.cantidad}
                          onChange={(e) => cambiarCantidad(i, e.target.value)}
                        />
                        <Button size="icon-sm" variant="outline" aria-label="Más" onClick={() => sumar(i, r.producto.unidad === 'kg' ? 0.5 : 1)}>
                          <Plus aria-hidden="true" />
                        </Button>
                        <span className="text-[13px] text-tinta-suave">{r.producto.unidad === 'kg' ? 'kg' : 'u'}</span>
                      </div>
                      <span className="numeros font-semibold">{ok ? pesos(subtotalDe(aMilesimas(n!), r.producto.precioCentavos)) : '—'}</span>
                    </div>
                    {ok && aMilesimas(n!) > r.producto.stockMilesimas && (
                      <p role="alert" className="text-[13px] font-medium text-rojo">
                        Solo quedan {cantidadConUnidad(r.producto.stockMilesimas, r.producto.unidad)}.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-linea pt-4">
            <span className="text-tinta-suave">Total</span>
            <span className="numeros font-display text-[34px] leading-none font-semibold">{pesos(total)}</span>
          </div>

          <div role="group" aria-label="Forma de pago" className="grid grid-cols-2 gap-2">
            {METODOS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metodo === m}
                onClick={() => {
                  setMetodo(m);
                  setError('');
                }}
                className={cn(
                  'h-11 rounded-md border text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                  metodo === m ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent hover:text-tinta',
                )}
              >
                {NOMBRE_METODO[m]}
              </button>
            ))}
          </div>
          <p role="alert" className="min-h-5 text-[14px] font-medium text-rojo">
            {error}
          </p>
          <Button size="lg" disabled={vender.isPending || carrito.length === 0} onClick={cobrar}>
            Cobrar {carrito.length > 0 && !invalida ? pesos(total) : ''}
          </Button>
        </section>
      </div>

      <section aria-label="Ventas de hoy" className="rounded-lg border border-linea bg-superficie">
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <h2 className="font-display text-lg font-semibold">Ventas de hoy</h2>
          {ventas.data && ventas.data.porMetodo.length > 0 && (
            <p className="numeros flex flex-wrap gap-x-4 text-[13px] text-tinta-suave">
              {ventas.data.porMetodo.map((m) => (
                <span key={m.metodo}>
                  {NOMBRE_METODO[m.metodo]}: <strong className="text-tinta">{pesos(m.centavos)}</strong>
                </span>
              ))}
            </p>
          )}
        </div>
        {!ventas.data ? (
          <p className="px-5 py-6 text-tinta-suave">Cargando…</p>
        ) : ventas.data.ventas.length === 0 ? (
          <p className="px-5 py-6 text-tinta-suave">Todavía no hay ventas hoy.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {ventas.data.ventas.map((v) => (
              <li key={v.id} className={cn('flex items-start gap-4 px-5 py-3', v.anulada && 'opacity-55')}>
                <span className="numeros w-12 pt-0.5 text-tinta-suave">{v.hora}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[15px]', v.anulada && 'line-through')}>
                    {v.items.map((i) => `${cantidadLegible(i.cantidadMilesimas)}${i.unidad === 'kg' ? ' kg' : ' ×'} ${i.nombre}`).join(' · ')}
                  </p>
                  <p className="text-[13px] text-tinta-suave">
                    {NOMBRE_METODO[v.metodo]}
                    {v.usuario && ` · ${v.usuario}`}
                  </p>
                </div>
                {v.anulada ? <Badge variant="contorno">Anulada</Badge> : null}
                <span className={cn('numeros w-28 text-right font-semibold', v.anulada && 'line-through')}>{pesos(v.totalCentavos)}</span>
                {v.anulada ? (
                  <span className="w-[68px]" aria-hidden="true" />
                ) : (
                  <Button size="sm" variant="ghost-destructive" className="w-[68px]" onClick={() => setAnular(v)}>
                    Anular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Confirmar
        confirmacion={
          anular
            ? {
                titulo: '¿Anular esta venta?',
                descripcion: `Se devuelve el stock de lo vendido (${pesos(anular.totalCentavos)}). La venta queda registrada como anulada, no se borra.`,
                boton: 'Anular venta',
                volver: 'Volver',
                alConfirmar: () => {
                  const id = anular.id;
                  setAnular(null);
                  anularVenta.mutate(id, { onError: (e) => toast.error(e.message) });
                },
              }
            : null
        }
        alCerrar={() => setAnular(null)}
      />
    </div>
  );
}
