// Ajustes: datos de la veterinaria, usuarios, copias de seguridad y el mensaje de WhatsApp.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NOMBRE_DIA, esquemaVeterinaria, esquemaMensajeRecordatorio, type DatosVeterinaria } from '@compartido/esquemas';
import { MARCADORES, armarMensaje } from '@compartido/whatsapp';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TarjetaUsuarios } from './tarjeta-usuarios';
import { TarjetaCopias } from './tarjeta-copias';
import { desenvolver, turnos } from '@/lib/api';
import { CLAVES, useAccion } from '@/features/comun/consultas';
import { Encabezado } from '@/features/comun/encabezado';
import { useVeterinaria } from '@/components/layout/barra-lateral';

export function PaginaAjustes() {
  const info = useQuery({ queryKey: ['sistema'], queryFn: () => desenvolver(turnos().sistema.info()) });
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-10 pt-9 pb-12">
      <Encabezado titulo="Ajustes" detalle="Datos de la veterinaria, usuarios, copias de seguridad y el mensaje de WhatsApp." />
      <TarjetaVeterinaria />
      <TarjetaUsuarios />
      <TarjetaCopias />
      <TarjetaRecordatorio />
      {info.data && (
        <p className="text-center text-[13px] text-tinta-suave">
          Veterinaria versión {info.data.version} · Base de datos: <span className="break-all">{info.data.baseDeDatos}</span>
        </p>
      )}
    </div>
  );
}

function TarjetaVeterinaria() {
  const veterinaria = useVeterinaria();
  const [f, setF] = useState<DatosVeterinaria>({ nombreVeterinaria: '', direccion: '', telefono: '' });
  const [error, setError] = useState('');
  const guardar = useAccion((d: DatosVeterinaria) => desenvolver(turnos().veterinaria.guardar(d)), [CLAVES.veterinaria], 'Datos de la veterinaria guardados');
  useEffect(() => {
    if (veterinaria.data) setF(veterinaria.data);
  }, [veterinaria.data]);
  const c = veterinaria.data;
  const cambio = !!c && (f.nombreVeterinaria !== c.nombreVeterinaria || f.direccion !== c.direccion || f.telefono !== c.telefono);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaVeterinaria.safeParse(f);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(r.data, { onError: (e) => setError(e.message) });
  }

  return (
    <section className="rounded-lg border border-linea bg-superficie p-6">
      <h2 className="font-display text-xl font-semibold">Veterinaria</h2>
      <p className="text-[14px] text-tinta-suave">El nombre aparece arriba a la izquierda y en los recordatorios por WhatsApp.</p>
      <form onSubmit={enviar} noValidate className="mt-4 grid grid-cols-2 gap-4">
        <Campo etiqueta="Nombre de la veterinaria" htmlFor="c-nombre" className="col-span-2">
          <Input id="c-nombre" maxLength={50} value={f.nombreVeterinaria} onChange={(e) => setF({ ...f, nombreVeterinaria: e.target.value })} />
        </Campo>
        <Campo etiqueta="Dirección (opcional)" htmlFor="c-direccion">
          <Input id="c-direccion" maxLength={80} value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)" htmlFor="c-telefono">
          <Input id="c-telefono" inputMode="tel" maxLength={40} value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={!cambio || guardar.isPending}>
            Guardar cambios
          </Button>
          {error && (
            <p role="alert" className="text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

/** El texto del WhatsApp, con marcas que se reemplazan por los datos de cada turno. */
function TarjetaRecordatorio() {
  const veterinaria = useVeterinaria();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const guardar = useAccion((m: string) => desenvolver(turnos().veterinaria.guardarMensaje(m)), [CLAVES.veterinaria], 'Mensaje del recordatorio guardado');
  useEffect(() => {
    if (veterinaria.data) setTexto(veterinaria.data.mensajeRecordatorio);
  }, [veterinaria.data]);

  // Pone la marca donde está el cursor
  function insertar(marca: string) {
    const el = campo.current;
    const inicio = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + marca + texto.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + marca.length, inicio + marca.length);
    });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaMensajeRecordatorio.safeParse(texto);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá el mensaje.');
    setError('');
    guardar.mutate(r.data, { onError: (err) => setError(err.message) });
  }

  const manana = new Date(Date.now() + 86_400_000);
  const ejemplo = armarMensaje(texto, {
    nombre: 'Juan',
    apellido: 'Pérez',
    mascota: 'Firulais',
    profesional: 'Dra. Laura Benítez',
    dia: `${NOMBRE_DIA[manana.getDay() === 0 ? 7 : manana.getDay()]} ${String(manana.getDate()).padStart(2, '0')}/${String(manana.getMonth() + 1).padStart(2, '0')}`,
    hora: '08:20',
    veterinaria: veterinaria.data?.nombreVeterinaria ?? '',
    direccion: veterinaria.data?.direccion ?? '',
  });

  return (
    <section className="rounded-lg border border-linea bg-superficie p-6">
      <h2 className="font-display text-xl font-semibold">Recordatorio por WhatsApp</h2>
      <p className="text-[14px] text-tinta-suave">El mensaje que se abre en WhatsApp desde Recepción. Tocá una marca para agregarla donde está el cursor.</p>
      <form onSubmit={enviar} noValidate className="mt-4 grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <Textarea ref={campo} aria-label="Mensaje del recordatorio" rows={6} maxLength={600} value={texto} onChange={(e) => { setTexto(e.target.value); setError(''); }} />
          <div className="flex flex-wrap gap-1.5">
            {MARCADORES.map((m) => (
              <button
                key={m.marca}
                type="button"
                title={m.explicacion}
                onClick={() => insertar(m.marca)}
                className="rounded-full border border-linea-fuerte px-2.5 py-1 font-mono text-[12px] text-tinta-suave outline-none hover:bg-accent hover:text-tinta focus-visible:ring-2 focus-visible:ring-acento/50"
              >
                {m.marca}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={guardar.isPending || texto === veterinaria.data?.mensajeRecordatorio}>
              Guardar mensaje
            </Button>
            {error && (
              <p role="alert" className="text-sm font-semibold text-rojo">
                {error}
              </p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Así le llega al dueño</p>
          <p className="rounded-lg rounded-tl-none bg-[#dcf8c6] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-line text-[#111b21]">{ejemplo || ' '}</p>
        </div>
      </form>
    </section>
  );
}
