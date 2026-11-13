// Buscador de mascotas para dar un turno: se escribe el nombre de la mascota o del dueño y
// aparecen los resultados. Con las flechas se elige y con Enter se confirma.
// Si no existe, se crea ahí mismo (y queda elegido).
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desenvolver, turnos } from '@/lib/api';
import { edadLegible } from '@/lib/fechas';
import { cn } from '@/lib/utils';
import { CLAVES, useDemorado } from '@/features/comun/consultas';
import { DialogoMascota, etiquetaMascota } from '@/features/mascotas/dialogo-mascota';
import { NOMBRE_ESPECIE } from '@compartido/esquemas';

export interface MascotaElegido {
  id: number;
  nombre: string;
}

const MAXIMO = 6;

export function BuscadorMascota({
  valor,
  alElegir,
  bloqueado = false,
}: {
  valor: MascotaElegido | null;
  alElegir: (p: MascotaElegido | null) => void;
  /** Al reprogramar, la mascota no se cambia. */
  bloqueado?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const [nuevo, setNuevo] = useState(false);
  const idLista = useId();
  const demorado = useDemorado(texto.trim(), 200);
  const buscando = demorado.length >= 2;

  const resultados = useQuery({
    queryKey: [...CLAVES.mascotas, 'buscador', demorado],
    queryFn: () => desenvolver(turnos().mascotas.buscar({ texto: demorado })),
    enabled: buscando,
    placeholderData: keepPreviousData,
  });
  const lista = buscando ? (resultados.data ?? []).slice(0, MAXIMO) : [];
  // La última opción es siempre "Nueva mascota"
  const opciones = lista.length + 1;

  useEffect(() => setActivo(0), [demorado]);

  if (valor) {
    return (
      <div className="flex h-11 items-center gap-3 rounded-md border border-input bg-acento-suave/60 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">{valor.nombre}</span>
        {!bloqueado && (
          <Button size="icon-sm" variant="ghost" aria-label="Elegir otra mascota" onClick={() => alElegir(null)}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  function teclas(e: KeyboardEvent<HTMLInputElement>) {
    if (!buscando) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => (a + 1) % opciones);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => (a - 1 + opciones) % opciones);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = lista[activo];
      if (p) alElegir({ id: p.id, nombre: etiquetaMascota(p) });
      else setNuevo(true);
    }
  }

  const idOpcion = (i: number) => `${idLista}-${i}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
        <Input
          role="combobox"
          aria-label="Buscar mascota"
          aria-expanded={buscando}
          aria-controls={idLista}
          aria-activedescendant={buscando ? idOpcion(activo) : undefined}
          aria-autocomplete="list"
          placeholder="Mascota, dueño o teléfono"
          className="pl-10"
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
        />
      </div>
      {buscando && (
        <ul id={idLista} role="listbox" aria-label="Mascotas encontradas" className="flex flex-col overflow-hidden rounded-md border border-linea">
          {lista.map((p, i) => {
            const anios = edadLegible(p.fechaNacimiento);
            return (
              <li
                key={p.id}
                id={idOpcion(i)}
                role="option"
                aria-selected={i === activo}
                onMouseEnter={() => setActivo(i)}
                onClick={() => alElegir({ id: p.id, nombre: etiquetaMascota(p) })}
                className={cn('flex cursor-pointer items-baseline gap-3 border-b border-linea px-3 py-2', i === activo && 'bg-acento-suave')}
              >
                <span className="font-semibold">{p.nombre}</span>
                <span className="truncate text-[13px] text-tinta-suave">
                  {NOMBRE_ESPECIE[p.especie]}
                  {anios && ` · ${anios}`} · {p.dueno.apellido}, {p.dueno.nombre}
                </span>
              </li>
            );
          })}
          {resultados.isSuccess && lista.length === 0 && <li className="border-b border-linea px-3 py-2 text-[14px] text-tinta-suave">No hay mascotas con «{demorado}».</li>}
          <li
            id={idOpcion(lista.length)}
            role="option"
            aria-selected={activo === lista.length}
            onMouseEnter={() => setActivo(lista.length)}
            onClick={() => setNuevo(true)}
            className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 font-semibold text-acento-fuerte', activo === lista.length && 'bg-acento-suave')}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Nueva mascota
          </li>
        </ul>
      )}
      {!buscando && (
        <p className="text-[13px] text-tinta-suave">
          Escribí al menos 2 letras o números.{' '}
          <button type="button" className="font-semibold text-acento-fuerte underline-offset-2 hover:underline" onClick={() => setNuevo(true)}>
            O cargá una mascota nueva
          </button>
        </p>
      )}
      <DialogoMascota mascota={nuevo ? 'nuevo' : null} sugerencia={texto} alCerrar={() => setNuevo(false)} alGuardar={(id, nombre) => alElegir({ id, nombre })} />
    </div>
  );
}
