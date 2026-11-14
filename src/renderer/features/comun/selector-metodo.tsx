// Cómo paga: cuatro botones grandes (se usan al dar el alta y al entregar un baño).
import { METODOS, NOMBRE_METODO } from '@compartido/esquemas';
import type { MetodoPago } from '@compartido/tipos';
import { cn } from '@/lib/utils';

export function SelectorMetodo({ valor, alCambiar }: { valor: MetodoPago | null; alCambiar: (m: MetodoPago) => void }) {
  return (
    <div role="group" aria-label="Forma de pago" className="grid grid-cols-2 gap-2">
      {METODOS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={valor === m}
          onClick={() => alCambiar(m)}
          className={cn(
            'h-11 rounded-md border text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
            valor === m ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-linea-fuerte text-tinta-suave hover:bg-accent hover:text-tinta',
          )}
        >
          {NOMBRE_METODO[m]}
        </button>
      ))}
    </div>
  );
}
