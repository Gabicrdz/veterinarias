// Lista de mascotas: buscar (por nombre de la mascota, dueño, teléfono o chip),
// filtrar por especie y abrir la ficha para editar.
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { edadLegible } from '@/lib/fechas';
import { ESPECIES, NOMBRE_ESPECIE } from '@compartido/esquemas';
import type { Mascota } from '@compartido/tipos';
import { useUsuario } from '@/features/sesion/consultas';
import { useCargarEjemplo, useDemorado, useMascotas, useResumen } from '@/features/comun/consultas';
import { Encabezado, Vacio } from '@/features/comun/encabezado';
import { DialogoMascota } from './dialogo-mascota';

export function PaginaMascotas() {
  const [texto, setTexto] = useState('');
  const [especie, setEspecie] = useState('todas');
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [abierto, setAbierto] = useState<Mascota | 'nuevo' | null>(null);
  const buscado = useDemorado(texto);
  const filtro = {
    texto: buscado,
    especie: especie === 'todas' ? null : (especie as (typeof ESPECIES)[number]),
    incluirBajas,
  };
  const mascotas = useMascotas(filtro);
  const resumen = useResumen();
  const ejemplo = useCargarEjemplo();
  const { esAdmin } = useUsuario();
  const lista = mascotas.data ?? [];
  const veterinariaVacia = resumen.data?.mascotas === 0 && !incluirBajas;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-10 pt-9 pb-12">
      <Encabezado
        titulo="Mascotas"
        detalle={resumen.data ? `${resumen.data.mascotas.toLocaleString('es-AR')} ${resumen.data.mascotas === 1 ? 'mascota activa' : 'mascotas activas'}` : ' '}
      >
        <Button onClick={() => setAbierto('nuevo')}>
          <Plus /> Nueva mascota
        </Button>
      </Encabezado>

      {veterinariaVacia ? (
        <Vacio
          titulo="Todavía no hay mascotas"
          acciones={
            <>
              <Button onClick={() => setAbierto('nuevo')}>
                <Plus /> Cargar la primera
              </Button>
              {esAdmin && (
                <Button variant="outline" disabled={ejemplo.isPending} onClick={() => ejemplo.mutate()}>
                  Cargar datos de ejemplo
                </Button>
              )}
            </>
          }
        >
          Cargá las mascotas a medida que vienen con su dueño, o probá el sistema con 32 mascotas y 3 veterinarios de ejemplo.
        </Vacio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-[400px]">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" />
              <Input
                autoFocus
                aria-label="Buscar mascota"
                placeholder="Mascota, dueño, teléfono o microchip"
                className="pl-10"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
            <Select value={especie} onValueChange={setEspecie}>
              <SelectTrigger aria-label="Especie" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las especies</SelectItem>
                {ESPECIES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {NOMBRE_ESPECIE[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-[14px] text-tinta-suave">
              <Checkbox checked={incluirBajas} onCheckedChange={(v) => setIncluirBajas(v === true)} />
              Ver dadas de baja
            </label>
          </div>

          {mascotas.isError && <p role="alert" className="font-semibold text-rojo">{mascotas.error.message}</p>}

          {mascotas.isSuccess && lista.length === 0 ? (
            <Vacio titulo="Ninguna mascota coincide">Probá con otra parte del nombre, el apellido del dueño o el teléfono.</Vacio>
          ) : (
            <TablaMascotas mascotas={lista} atenuada={mascotas.isPlaceholderData} alAbrir={setAbierto} />
          )}
          {lista.length === 300 && <p className="text-[13px] text-tinta-suave">Se muestran las primeras 300. Escribí algo para encontrar al resto.</p>}
        </>
      )}

      <DialogoMascota mascota={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}

function TablaMascotas({ mascotas, atenuada, alAbrir }: { mascotas: Mascota[]; atenuada: boolean; alAbrir: (m: Mascota) => void }) {
  return (
    <table className={cn('w-full text-[15px] transition-opacity', atenuada && 'opacity-60')}>
      <thead>
        <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
          <th scope="col" className="py-2.5 pl-3 font-medium">Mascota</th>
          <th scope="col" className="py-2.5 font-medium">Especie y raza</th>
          <th scope="col" className="py-2.5 font-medium">Edad</th>
          <th scope="col" className="py-2.5 font-medium">Dueño</th>
          <th scope="col" className="py-2.5 pr-3 font-medium">Teléfono</th>
        </tr>
      </thead>
      <tbody>
        {mascotas.map((m) => (
          <tr key={m.id} className={cn('relative border-b border-linea hover:bg-superficie', !m.activo && 'text-tinta-suave')}>
            <td className="py-3 pl-3">
              <button
                type="button"
                onClick={() => alAbrir(m)}
                className="text-left font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {m.nombre}
              </button>
              {!m.activo && <Badge className="ml-2" variant="contorno">De baja</Badge>}
            </td>
            <td className="py-3">
              {NOMBRE_ESPECIE[m.especie]}
              {m.raza && <span className="text-tinta-suave"> · {m.raza}</span>}
            </td>
            <td className="numeros py-3">{edadLegible(m.fechaNacimiento) ?? '—'}</td>
            <td className="py-3">
              {m.dueno.apellido}, {m.dueno.nombre}
            </td>
            <td className="numeros py-3 pr-3">{m.dueno.telefono || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
