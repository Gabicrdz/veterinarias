// Ficha de la mascota y de su dueño (nueva o para editar). Valida con el mismo
// esquema Zod que el main y muestra cada error debajo de su campo. Mascota y
// dueño se guardan juntos: si algo falla, no se guarda nada.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, NotebookText, Search, Syringe, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { ESPECIES, NOMBRE_ESPECIE, esquemaMascota, type DatosMascota } from '@compartido/esquemas';
import type { Dueno, Mascota } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { desenvolver, turnos } from '@/lib/api';
import { edadLegible, fechaISO } from '@/lib/fechas';
import { CLAVES, useAccion, useDemorado } from '@/features/comun/consultas';
import { dniConPuntos } from '@/features/comun/encabezado';
import { TurnosDeLaMascota } from '@/features/agenda/turnos-de-la-mascota';
import { DialogoHistoria } from '@/features/consulta/historia';
import { DialogoAplicacion } from '@/features/vacunas/dialogo-aplicacion';
import { DialogoCarnet } from '@/features/vacunas/dialogo-carnet';
import { useUsuario } from '@/features/sesion/consultas';

/** Los errores se buscan por el nombre del campo; los del dueño llevan el prefijo "dueno.". */
type Errores = Record<string, string | undefined>;

const VACIO = {
  nombre: '', especie: 'perro', raza: '', sexo: '', castrado: false, fechaNacimiento: '', color: '', microchip: '', notas: '',
  duenoId: null as number | null, duenoNombre: '', duenoApellido: '', duenoDni: '', duenoTelefono: '', duenoEmail: '', duenoDireccion: '', duenoNotas: '',
};
type Formulario = typeof VACIO;

const desdeDueno = (d: Dueno) => ({
  duenoId: d.id, duenoNombre: d.nombre, duenoApellido: d.apellido, duenoDni: d.dni ?? '', duenoTelefono: d.telefono,
  duenoEmail: d.email, duenoDireccion: d.direccion, duenoNotas: d.notas,
});

/**
 * Lo escrito en un buscador, como punto de partida para una mascota nueva:
 * "30123456" → DNI del dueño; "firulais" → nombre de la mascota.
 */
function desdeSugerencia(texto: string): Partial<Formulario> {
  const limpio = texto.trim();
  if (!limpio) return {};
  if (/^[\d.\s]+$/.test(limpio)) return { duenoDni: limpio.replace(/\D/g, '') };
  return { nombre: limpio.charAt(0).toLocaleUpperCase('es') + limpio.slice(1) };
}

interface Props {
  mascota: Mascota | 'nuevo' | null;
  alCerrar: () => void;
  /** Para una nueva: lo que se escribió en el buscador. */
  sugerencia?: string;
  /** Avisa el id y el nombre de la mascota guardada (lo usa el diálogo de turnos). */
  alGuardar?: (id: number, nombre: string) => void;
}

export function etiquetaMascota(m: { nombre: string; dueno: { apellido: string } }): string {
  return `${m.nombre} (${m.dueno.apellido})`;
}

export function DialogoMascota({ mascota, alCerrar, sugerencia = '', alGuardar }: Props) {
  const navegar = useNavigate();
  const { veClinica } = useUsuario();
  const [historia, setHistoria] = useState(false);
  const [carnet, setCarnet] = useState(false);
  const [registrarVacuna, setRegistrarVacuna] = useState(false);
  const [f, setF] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const existente = mascota && mascota !== 'nuevo' ? mascota : null;

  useEffect(() => {
    if (!mascota) return;
    setErrores({});
    setF(
      existente
        ? {
            nombre: existente.nombre, especie: existente.especie, raza: existente.raza, sexo: existente.sexo ?? '', castrado: existente.castrado,
            fechaNacimiento: existente.fechaNacimiento ?? '', color: existente.color, microchip: existente.microchip ?? '', notas: existente.notas,
            ...desdeDueno(existente.dueno),
          }
        : { ...VACIO, ...desdeSugerencia(sugerencia) },
    );
    // La sugerencia solo se usa al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mascota, existente]);

  const guardar = useAccion((d: DatosMascota) => desenvolver(turnos().mascotas.guardar(d)), [CLAVES.mascotas, CLAVES.duenos, CLAVES.agenda], existente ? 'Cambios guardados' : 'Mascota agregada');
  const activo = useAccion(
    (a: boolean) => desenvolver(turnos().mascotas.cambiarActivo(existente!.id, a)),
    [CLAVES.mascotas, CLAVES.agenda],
    (_) => (existente?.activo ? 'Mascota dada de baja' : 'Mascota reactivada'),
  );

  const cambiar = <C extends keyof Formulario>(campo: C) => (valor: Formulario[C]) => {
    setF((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  function enviar(e: FormEvent) {
    e.preventDefault();
    const datos: DatosMascota = {
      ...(existente ? { id: existente.id } : {}),
      nombre: f.nombre, especie: f.especie as DatosMascota['especie'], raza: f.raza, sexo: f.sexo as DatosMascota['sexo'], castrado: f.castrado,
      fechaNacimiento: f.fechaNacimiento, color: f.color, microchip: f.microchip, notas: f.notas,
      dueno: {
        ...(f.duenoId !== null ? { id: f.duenoId } : {}),
        nombre: f.duenoNombre, apellido: f.duenoApellido, dni: f.duenoDni, telefono: f.duenoTelefono,
        email: f.duenoEmail, direccion: f.duenoDireccion, notas: f.duenoNotas,
      },
    };
    const r = esquemaMascota.safeParse(datos);
    if (!r.success) {
      const nuevos: Errores = {};
      for (const issue of r.error.issues) {
        const [a, b] = issue.path as string[];
        const clave = a === 'dueno' ? `dueno${b![0]!.toUpperCase()}${b!.slice(1)}` : a!;
        nuevos[clave] ??= issue.message;
      }
      return setErrores(nuevos);
    }
    guardar.mutate(r.data, {
      onSuccess: (id) => {
        alGuardar?.(id, `${r.data.nombre} (${r.data.dueno.apellido})`);
        alCerrar();
      },
      // Errores del main (DNI o microchip repetido, fecha futura…): al campo que corresponde
      onError: (error) => {
        if (error.message.includes('DNI')) setErrores({ duenoDni: error.message });
        else if (error.message.includes('microchip')) setErrores({ microchip: error.message });
        else if (error.message.includes('nacimiento')) setErrores({ fechaNacimiento: error.message });
        else toast.error(error.message);
      },
    });
  }

  const edadTexto = edadLegible(f.fechaNacimiento || null);
  const nombreCompleto = existente ? etiquetaMascota(existente) : '';

  return (
    <Dialog open={mascota !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[760px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{existente ? nombreCompleto : 'Nueva mascota'}</DialogTitle>
            <DialogDescription>
              {existente
                ? `${NOMBRE_ESPECIE[existente.especie]}${existente.raza ? ` · ${existente.raza}` : ''}${existente.activo ? '' : ' · dada de baja'}`
                : 'Hace falta el nombre de la mascota y el nombre y apellido de su dueño.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-2 gap-x-5 gap-y-4">
            <h3 className="col-span-2 font-display text-lg font-semibold">La mascota</h3>
            <Campo etiqueta="Nombre" htmlFor="m-nombre" error={errores.nombre}>
              <Input id="m-nombre" autoFocus maxLength={40} value={f.nombre} onChange={(e) => cambiar('nombre')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Especie" error={errores.especie}>
              <Select value={f.especie} onValueChange={cambiar('especie')}>
                <SelectTrigger aria-label="Especie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESPECIES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {NOMBRE_ESPECIE[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Raza (opcional)" htmlFor="m-raza" error={errores.raza}>
              <Input id="m-raza" maxLength={40} placeholder="Si es mestiza, dejalo vacío" value={f.raza} onChange={(e) => cambiar('raza')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Sexo" error={errores.sexo}>
              <div className="flex items-center gap-4">
                <Select value={f.sexo === '' ? 'no-se' : f.sexo} onValueChange={(v) => cambiar('sexo')(v === 'no-se' ? '' : v)}>
                  <SelectTrigger aria-label="Sexo" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="macho">Macho</SelectItem>
                    <SelectItem value="hembra">Hembra</SelectItem>
                    <SelectItem value="no-se">No se sabe</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-[14px] whitespace-nowrap">
                  <Checkbox checked={f.castrado} onCheckedChange={(v) => cambiar('castrado')(v === true)} />
                  Castrado/a
                </label>
              </div>
            </Campo>
            <Campo
              etiqueta="Fecha de nacimiento"
              htmlFor="m-nacimiento"
              error={errores.fechaNacimiento}
              ayuda={edadTexto ? edadTexto : 'Si no la saben, una fecha aproximada sirve.'}
            >
              <Input id="m-nacimiento" type="date" max={fechaISO()} value={f.fechaNacimiento} onChange={(e) => cambiar('fechaNacimiento')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Color o señas (opcional)" htmlFor="m-color" error={errores.color}>
              <Input id="m-color" maxLength={40} value={f.color} onChange={(e) => cambiar('color')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Microchip (opcional)" htmlFor="m-chip" error={errores.microchip} ayuda="De 9 a 15 números.">
              <Input id="m-chip" inputMode="numeric" maxLength={20} value={f.microchip} onChange={(e) => cambiar('microchip')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas administrativas" htmlFor="m-notas" error={errores.notas} ayuda="Por ejemplo: muerde si le tocan las patas. Lo clínico va en la consulta.">
              <Textarea id="m-notas" rows={2} maxLength={300} value={f.notas} onChange={(e) => cambiar('notas')(e.target.value)} />
            </Campo>

            <div className="col-span-2 mt-1 flex items-center justify-between gap-3 border-t border-linea pt-4">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <UserRound className="size-[18px] text-acento-fuerte" aria-hidden="true" />
                El dueño
              </h3>
              {f.duenoId !== null && !existente && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setF((v) => ({ ...v, duenoId: null, duenoNombre: '', duenoApellido: '', duenoDni: '', duenoTelefono: '', duenoEmail: '', duenoDireccion: '', duenoNotas: '' }))}
                >
                  <X aria-hidden="true" /> Es otro dueño
                </Button>
              )}
            </div>
            {!existente && f.duenoId === null && <BuscadorDueno alElegir={(d) => setF((v) => ({ ...v, ...desdeDueno(d) }))} />}
            {f.duenoId !== null && !existente && (
              <p className="col-span-2 -mt-2 rounded-md bg-acento-suave/60 px-3 py-2 text-[14px]">
                Dueño ya cargado: la mascota se suma a su familia. Si cambiás sus datos, se actualizan para todas sus mascotas.
              </p>
            )}
            <Campo etiqueta="Apellido" htmlFor="d-apellido" error={errores.duenoApellido}>
              <Input id="d-apellido" maxLength={40} value={f.duenoApellido} onChange={(e) => cambiar('duenoApellido')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="d-nombre" error={errores.duenoNombre}>
              <Input id="d-nombre" maxLength={40} value={f.duenoNombre} onChange={(e) => cambiar('duenoNombre')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Teléfono" htmlFor="d-telefono" error={errores.duenoTelefono} ayuda="Para los avisos de turno y de vacunas por WhatsApp.">
              <Input id="d-telefono" inputMode="tel" maxLength={30} value={f.duenoTelefono} onChange={(e) => cambiar('duenoTelefono')(e.target.value)} />
            </Campo>
            <Campo etiqueta="DNI (opcional)" htmlFor="d-dni" error={errores.duenoDni} ayuda="Con o sin puntos.">
              <Input id="d-dni" inputMode="numeric" maxLength={12} value={f.duenoDni} onChange={(e) => cambiar('duenoDni')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Email (opcional)" htmlFor="d-email" error={errores.duenoEmail}>
              <Input id="d-email" type="email" maxLength={80} value={f.duenoEmail} onChange={(e) => cambiar('duenoEmail')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Dirección (opcional)" htmlFor="d-direccion" error={errores.duenoDireccion}>
              <Input id="d-direccion" maxLength={80} value={f.duenoDireccion} onChange={(e) => cambiar('duenoDireccion')(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas del dueño" htmlFor="d-notas" error={errores.duenoNotas} ayuda="Por ejemplo: paga a fin de mes." className="col-span-2">
              <Textarea id="d-notas" rows={2} maxLength={300} value={f.duenoNotas} onChange={(e) => cambiar('duenoNotas')(e.target.value)} />
            </Campo>

            {existente && (
              <section aria-labelledby="t-turnos-mascota" className="col-span-2 flex flex-col gap-3 border-t border-linea pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="t-turnos-mascota" className="font-display text-lg font-semibold">
                    Turnos
                  </h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCarnet(true)}>
                      <Syringe aria-hidden="true" />
                      Carnet de vacunas
                    </Button>
                    {veClinica && (
                      <Button size="sm" variant="outline" onClick={() => setHistoria(true)}>
                        <NotebookText aria-hidden="true" />
                        Historia clínica
                      </Button>
                    )}
                    {existente.activo && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          alCerrar();
                          navegar('/', { state: { nuevoTurnoPara: { id: existente.id, nombre: nombreCompleto } } });
                        }}
                      >
                        <CalendarPlus aria-hidden="true" />
                        Dar turno
                      </Button>
                    )}
                  </div>
                </div>
                <TurnosDeLaMascota mascotaId={existente.id} />
                <DialogoHistoria mascota={historia ? { id: existente.id, nombre: nombreCompleto } : null} alCerrar={() => setHistoria(false)} />
                <DialogoCarnet mascota={carnet ? { id: existente.id, nombre: existente.nombre, especie: existente.especie } : null} alCerrar={() => setCarnet(false)} alRegistrar={() => setRegistrarVacuna(true)} />
                <DialogoAplicacion mascota={registrarVacuna ? { id: existente.id, nombre: existente.nombre, especie: existente.especie } : null} alCerrar={() => setRegistrarVacuna(false)} />
              </section>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <div>
              {existente && (
                <Button variant={existente.activo ? 'ghost-destructive' : 'ghost'} disabled={activo.isPending} onClick={() => activo.mutate(!existente.activo, { onSuccess: alCerrar })}>
                  {existente.activo ? 'Dar de baja' : 'Reactivar'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {existente ? 'Guardar cambios' : 'Agregar mascota'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "¿Ya es cliente?": busca dueños cargados para sumarles otra mascota sin escribir todo de nuevo. */
function BuscadorDueno({ alElegir }: { alElegir: (d: Dueno) => void }) {
  const [texto, setTexto] = useState('');
  const demorado = useDemorado(texto.trim(), 200);
  const buscando = demorado.length >= 2;
  const resultados = useQuery({
    queryKey: [...CLAVES.duenos, demorado],
    queryFn: () => desenvolver(turnos().mascotas.buscarDuenos({ texto: demorado })),
    enabled: buscando,
  });
  return (
    <div className="col-span-2 flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-tinta-suave" aria-hidden="true" />
        <Input
          aria-label="Buscar un dueño que ya es cliente"
          placeholder="¿Ya es cliente? Buscalo por apellido, DNI o teléfono"
          className="pl-10"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      {buscando && resultados.isSuccess && (
        <ul aria-label="Dueños encontrados" className="flex flex-col overflow-hidden rounded-md border border-linea">
          {resultados.data.length === 0 && <li className="px-3 py-2 text-[14px] text-tinta-suave">No hay dueños con «{demorado}»: completá los datos de abajo.</li>}
          {resultados.data.map((d) => (
            <li key={d.id} className="border-b border-linea last:border-b-0">
              <button type="button" onClick={() => alElegir(d)} className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-acento-suave">
                <span className="font-semibold">
                  {d.apellido}, {d.nombre}
                </span>
                <span className="numeros truncate text-[13px] text-tinta-suave">
                  {d.dni ? `DNI ${dniConPuntos(d.dni)}` : ''}
                  {d.dni && d.telefono ? ' · ' : ''}
                  {d.telefono}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
