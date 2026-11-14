// Reportes (solo administración): cómo le fue a la veterinaria en un período.
// Los números los calcula el main (servicios/reportes.ts, con pruebas); acá
// solo se muestran. Cada gráfico se puede ver como tabla.
import { useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { NOMBRE_ESPECIE, NOMBRE_METODO, type DatosPeriodo } from '@compartido/esquemas';
import { pesos } from '@compartido/dinero';
import { cantidadConUnidad } from '@compartido/productos';
import type { Reporte } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarrasHorizontales } from '@/components/graficos/barras';
import { GraficoColumnas } from '@/components/graficos/columnas';
import { TarjetaGrafico } from '@/components/graficos/tarjeta-grafico';
import { desenvolver, turnos } from '@/lib/api';
import { fechaISO } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { COLOR } from '@/features/profesionales/colores';

const porcentaje = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);
const pesosCortos = (c: number) => (c >= 100_000_000 ? `$ ${(c / 100_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : c >= 100_000 ? `$ ${Math.round(c / 100_000)} mil` : pesos(c));

function atajos(hoy: Date): { nombre: string; periodo: DatosPeriodo }[] {
  const mesPasado = subMonths(hoy, 1);
  return [
    { nombre: 'Este mes', periodo: { desde: fechaISO(startOfMonth(hoy)), hasta: fechaISO(endOfMonth(hoy)) } },
    { nombre: 'Mes anterior', periodo: { desde: fechaISO(startOfMonth(mesPasado)), hasta: fechaISO(endOfMonth(mesPasado)) } },
    { nombre: 'Esta semana', periodo: { desde: fechaISO(startOfWeek(hoy, { weekStartsOn: 1 })), hasta: fechaISO(addDays(startOfWeek(hoy, { weekStartsOn: 1 }), 6)) } },
    { nombre: 'Últimos 30 días', periodo: { desde: fechaISO(addDays(hoy, -29)), hasta: fechaISO(hoy) } },
  ];
}

export function PaginaReportes() {
  const opciones = atajos(new Date());
  const [periodo, setPeriodo] = useState<DatosPeriodo>(opciones[0]!.periodo);
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(periodo.desde) && /^\d{4}-\d{2}-\d{2}$/.test(periodo.hasta) && periodo.desde <= periodo.hasta;
  const reporte = useQuery({
    queryKey: ['reporte', periodo.desde, periodo.hasta],
    queryFn: () => desenvolver(turnos().reportes.obtener(periodo)),
    enabled: valido,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado titulo="Reportes" detalle="Atenciones, ausentismo, cobros y especies del período.">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {opciones.map((o) => {
            const activo = o.periodo.desde === periodo.desde && o.periodo.hasta === periodo.hasta;
            return (
              <button
                key={o.nombre}
                type="button"
                aria-pressed={activo}
                onClick={() => setPeriodo(o.periodo)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
                  activo ? 'border-tinta bg-tinta text-white' : 'border-linea-fuerte bg-superficie text-tinta-suave hover:text-tinta',
                )}
              >
                {o.nombre}
              </button>
            );
          })}
          <Input type="date" aria-label="Desde" className="h-9 w-[150px]" value={periodo.desde} onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))} />
          <span className="text-tinta-suave">a</span>
          <Input type="date" aria-label="Hasta" className="h-9 w-[150px]" value={periodo.hasta} onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))} />
        </div>
      </Encabezado>

      {!valido ? (
        <p className="text-rojo">Revisá las fechas: "desde" tiene que ser antes que "hasta".</p>
      ) : reporte.isError ? (
        <p className="text-rojo">{reporte.error.message}</p>
      ) : !reporte.data ? (
        <p className="text-tinta-suave">Calculando…</p>
      ) : reporte.data.totales.turnos === 0 ? (
        <Vacio titulo="No hay turnos en este período">Elegí otro período de arriba.</Vacio>
      ) : (
        <Contenido r={reporte.data} periodo={periodo} />
      )}
    </div>
  );
}

function Contenido({ r, periodo }: { r: Reporte; periodo: DatosPeriodo }) {
  const t = r.totales;
  const exportar = useMutation({
    mutationFn: () => desenvolver(turnos().reportes.exportarAtenciones(periodo)),
    onSuccess: (res) => res && toast.success(res.cantidad === 1 ? '1 atención guardada' : `${res.cantidad} atenciones guardadas`, { description: res.ruta }),
    onError: (e) => toast.error(e.message),
  });
  const atendidasEnTotal = r.porEspecie.reduce((suma, e) => suma + e.atenciones, 0);

  return (
    <>
      {/* Números principales, separados por líneas (sin tarjetas) */}
      <dl className="grid grid-cols-4 divide-x divide-linea rounded-lg border border-linea bg-superficie">
        <Indicador nombre="Atenciones" valor={String(t.atendidos)} detalle={`${t.mascotasAtendidos} mascotas · ${t.mascotasNuevos} nuevas`} />
        <Indicador nombre="Ausentismo" valor={porcentaje(t.ausentismo)} detalle={`${t.ausentes} ${t.ausentes === 1 ? 'no vino' : 'no vinieron'} · ${t.cancelados} cancelados`} alerta={(t.ausentismo ?? 0) >= 0.15} />
        <Indicador nombre="Cobrado" valor={pesosCortos(t.ingresosCentavos)} detalle="consultas del período" />
        <Indicador nombre="Atendidas sin cobrar" valor={String(t.atendidosSinCobrar)} detalle={t.atendidosSinCobrar ? 'revisalos en Recepción' : 'todo cobrado'} alerta={t.atendidosSinCobrar > 0} />
      </dl>

      <div className="grid grid-cols-[1.7fr_1fr] gap-5">
        <TarjetaGrafico
          titulo="Atenciones por día"
          descripcion="Mascotas atendidas cada día del período."
          tabla={{
            columnas: ['Día', 'Atendidos', 'No vinieron', 'Cobrado'],
            filas: r.porDia.map((d) => [format(parseISO(d.fecha), 'EEE d/M', { locale: es }), d.atendidos, d.ausentes, pesos(d.ingresosCentavos)]),
          }}
        >
          <GraficoColumnas
            nombre="Atenciones por día"
            columnas={r.porDia.map((d) => ({
              clave: d.fecha,
              etiqueta: r.porDia.length > 16 ? format(parseISO(d.fecha), 'd') : format(parseISO(d.fecha), 'EEE d', { locale: es }),
              titulo: format(parseISO(d.fecha), "EEEE d 'de' MMMM", { locale: es }),
              valor: d.atendidos,
              detalle: `${d.ausentes} no vinieron · ${pesos(d.ingresosCentavos)}`,
            }))}
            formatear={(v) => `${v} ${v === 1 ? 'atendida' : 'atendidas'}`}
            formatearEje={(v) => String(v)}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="Cobrado por forma de pago"
          descripcion="Lo que pagaron los dueños."
          tabla={{ columnas: ['Forma de pago', 'Cobros', 'Total'], filas: t.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], m.cantidad, pesos(m.centavos)]) }}
        >
          {t.porMetodo.length ? (
            <BarrasHorizontales
              barras={t.porMetodo.map((m) => ({ clave: m.metodo, etiqueta: NOMBRE_METODO[m.metodo], valor: m.centavos, detalle: `${m.cantidad} ${m.cantidad === 1 ? 'cobro' : 'cobros'}` }))}
              formatear={pesos}
              conPorcentaje
            />
          ) : (
            <p className="text-[14px] text-tinta-suave">Todavía no hay cobros con importe en el período.</p>
          )}
        </TarjetaGrafico>
      </div>

      <Seccion titulo="Por veterinario" descripcion="Ocupación: turnos dados sobre los que entraban según su horario (sin los días sin atención).">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
              <th className="py-2 font-medium">Veterinario</th>
              <th className="py-2 text-right font-medium">Turnos</th>
              <th className="py-2 text-right font-medium">Atendidas</th>
              <th className="py-2 text-right font-medium">Ausentismo</th>
              <th className="w-[260px] py-2 pl-6 font-medium">Ocupación</th>
              <th className="py-2 text-right font-medium">Cobrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {r.porProfesional.map((p) => (
              <tr key={p.profesionalId}>
                <td className="py-2.5">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: COLOR[p.color].fuerte }} aria-hidden="true" />
                    {p.nombre}
                  </span>
                </td>
                <td className="numeros py-2.5 text-right">{p.turnos}</td>
                <td className="numeros py-2.5 text-right">{p.atendidos}</td>
                <td className={cn('numeros py-2.5 text-right', (p.ausentismo ?? 0) >= 0.15 && 'font-semibold text-ambar')}>{porcentaje(p.ausentismo)}</td>
                <td className="py-2.5 pl-6">
                  <span className="flex items-center gap-3">
                    <span className="h-2.5 flex-1 rounded-r bg-secondary">
                      {p.ocupacion !== null && p.ocupacion > 0 && <span className="block h-full rounded-r bg-dato" style={{ width: `max(${p.ocupacion * 100}%, 3px)` }} />}
                    </span>
                    <span className="numeros w-32 text-right text-[13px] text-tinta-suave" title={`${p.turnos} turnos dados de ${p.disponibles} que entraban`}>
                      <strong className="text-tinta">{porcentaje(p.ocupacion)}</strong> · {p.turnos} de {p.disponibles}
                    </span>
                  </span>
                </td>
                <td className="numeros py-2.5 text-right">{pesos(p.ingresosCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Seccion>

      <Seccion titulo="Venta de productos" descripcion="Lo vendido en el mostrador (sin las ventas anuladas). La ganancia es precio menos costo del momento de cada venta.">
        {r.productos.ventas === 0 ? (
          <p className="text-[14px] text-tinta-suave">No hubo ventas de productos en este período.</p>
        ) : (
          <div className="grid grid-cols-[1fr_1.4fr] gap-8">
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-[13px] font-medium text-tinta-suave">Vendido</dt>
                <dd className="numeros font-display text-[28px] leading-none font-semibold">{pesosCortos(r.productos.totalCentavos)}</dd>
                <dd className="mt-1 text-[13px] text-tinta-suave">{r.productos.ventas} {r.productos.ventas === 1 ? 'venta' : 'ventas'}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-medium text-tinta-suave">Ganancia</dt>
                <dd className="numeros font-display text-[28px] leading-none font-semibold text-verde">{pesosCortos(r.productos.gananciaCentavos)}</dd>
              </div>
            </dl>
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-tinta-suave">Más vendidos</h3>
              <ul className="divide-y divide-linea">
                {r.productos.masVendidos.map((p) => (
                  <li key={p.productoId} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.nombre}</span>
                    <span className="numeros w-24 text-right text-[14px] text-tinta-suave">{cantidadConUnidad(p.cantidadMilesimas, p.unidad)}</span>
                    <span className="numeros w-28 text-right text-[14px]">{pesos(p.totalCentavos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Seccion>

      <div className="grid grid-cols-[1.5fr_1fr] gap-5">
        <Seccion titulo="Por especie" descripcion="Qué animales se atendieron en el período y cuánto se cobró por cada especie.">
          <ul className="divide-y divide-linea">
            {r.porEspecie.map((e) => (
              <li key={e.especie} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 font-semibold">{NOMBRE_ESPECIE[e.especie]}</span>
                <span className="numeros w-40 text-right text-[14px] text-tinta-suave">
                  {e.atenciones} {e.atenciones === 1 ? 'atención' : 'atenciones'}
                  {atendidasEnTotal > 0 && ` · ${Math.round((e.atenciones / atendidasEnTotal) * 100)} %`}
                </span>
                <span className="numeros w-28 text-right text-[14px]">{e.montoCentavos ? pesos(e.montoCentavos) : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" disabled={exportar.isPending} onClick={() => exportar.mutate()}>
              <FileSpreadsheet aria-hidden="true" />
              Exportar atenciones a Excel
            </Button>
          </div>
        </Seccion>
        <Seccion titulo="Los que más faltan" descripcion="Mascotas con dos o más ausencias en el período: conviene recordarles a los dueños con tiempo.">
          {r.faltadores.length ? (
            <ul className="divide-y divide-linea">
              {r.faltadores.map((f) => (
                <li key={f.mascotaId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.mascota}</span>
                    <span className="block text-[13px] text-tinta-suave">
                      {f.dueno} · {f.telefono || 'sin teléfono'}
                    </span>
                  </span>
                  <span className="numeros text-[14px]">
                    <strong className="text-ambar">{f.ausentes}</strong> de {f.turnos}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-tinta-suave">Ninguna mascota faltó dos veces o más en este período.</p>
          )}
        </Seccion>
      </div>
    </>
  );
}

function Indicador({ nombre, valor, detalle, alerta = false }: { nombre: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[13px] font-medium text-tinta-suave">{nombre}</dt>
      <dd className={cn('numeros mt-1 font-display text-[clamp(1.5rem,2.4vw,2.1rem)] leading-none font-semibold', alerta && 'text-ambar')}>{valor}</dd>
      <dd className="mt-1.5 text-[13px] text-tinta-suave">{detalle}</dd>
    </div>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-linea bg-superficie p-5">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      <p className="mb-3 text-[13px] text-tinta-suave">{descripcion}</p>
      {children}
    </section>
  );
}
