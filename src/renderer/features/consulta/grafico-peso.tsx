// Evolución del peso de la mascota: una línea con un punto por consulta que lo midió.
// SVG a mano (sin librerías). Se muestra desde dos mediciones; con una sola no hay "evolución".
import { format, parseISO } from 'date-fns';
import type { Consulta } from '@compartido/tipos';
import { pesoLegible } from '@/lib/numeros';

const ANCHO = 640;
const ALTO = 150;
const MARGEN = { izq: 44, der: 16, arriba: 14, abajo: 26 };

export function GraficoPeso({ consultas }: { consultas: Consulta[] }) {
  // De la más vieja a la más nueva
  const puntos = consultas
    .filter((c) => c.pesoKg !== null)
    .map((c) => ({ fecha: c.fecha, kg: c.pesoKg as number }))
    .reverse();
  if (puntos.length < 2) return null;

  const kgs = puntos.map((p) => p.kg);
  const margenKg = Math.max((Math.max(...kgs) - Math.min(...kgs)) * 0.2, 0.2);
  const minimo = Math.max(0, Math.min(...kgs) - margenKg);
  const maximo = Math.max(...kgs) + margenKg;
  const t0 = parseISO(puntos[0]!.fecha).getTime();
  const t1 = parseISO(puntos[puntos.length - 1]!.fecha).getTime();
  const x = (fecha: string) => MARGEN.izq + (t1 === t0 ? 0.5 : (parseISO(fecha).getTime() - t0) / (t1 - t0)) * (ANCHO - MARGEN.izq - MARGEN.der);
  const y = (kg: number) => MARGEN.arriba + (1 - (kg - minimo) / (maximo - minimo)) * (ALTO - MARGEN.arriba - MARGEN.abajo);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;
  const diferencia = ultimo.kg - primero.kg;

  return (
    <section aria-labelledby="g-peso" className="rounded-lg bg-background p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id="g-peso" className="font-display text-lg font-semibold">
          Evolución del peso
        </h3>
        <p className="numeros text-[13px] text-tinta-suave">
          {pesoLegible(ultimo.kg)} · {diferencia === 0 ? 'sin cambios' : `${diferencia > 0 ? '+' : '−'}${pesoLegible(Math.abs(Number(diferencia.toFixed(2))))} desde ${format(parseISO(primero.fecha), 'dd/MM')}`}
        </p>
      </div>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="mt-2 w-full" role="img" aria-label={`Peso en ${puntos.length} consultas, de ${pesoLegible(primero.kg)} a ${pesoLegible(ultimo.kg)}`}>
        {[minimo, (minimo + maximo) / 2, maximo].map((kg) => (
          <g key={kg}>
            <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={y(kg)} y2={y(kg)} stroke="var(--linea)" strokeWidth="1" />
            <text x={MARGEN.izq - 8} y={y(kg) + 4} textAnchor="end" fontSize="11" fill="var(--tinta-suave)">
              {kg.toFixed(1).replace('.', ',')}
            </text>
          </g>
        ))}
        <path d={linea} fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((p) => (
          <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.kg)} r="3.5" fill="var(--superficie)" stroke="var(--acento)" strokeWidth="2">
            <title>{`${format(parseISO(p.fecha), 'dd/MM/yyyy')}: ${pesoLegible(p.kg)}`}</title>
          </circle>
        ))}
        <text x={MARGEN.izq} y={ALTO - 6} fontSize="11" fill="var(--tinta-suave)">
          {format(parseISO(primero.fecha), 'dd/MM/yy')}
        </text>
        <text x={ANCHO - MARGEN.der} y={ALTO - 6} textAnchor="end" fontSize="11" fill="var(--tinta-suave)">
          {format(parseISO(ultimo.fecha), 'dd/MM/yy')}
        </text>
      </svg>
    </section>
  );
}
