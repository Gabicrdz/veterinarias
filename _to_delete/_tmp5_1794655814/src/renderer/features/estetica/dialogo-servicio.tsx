// Cargar un baño o corte: qué mascota, qué servicio, para cuándo y cuánto cuesta.
// El precio se propone con el último que se cobró de ese servicio.
import { useState, type FormEvent } from 'react';
import { esquemaServicioEstetica } from '@compartido/esquemas';
import { leerPesos, pesosParaCampo } from '@compartido/dinero';
import { NOMBRE_ESTETICA, TIPOS_ESTETICA, type TipoEstetica } from '@compartido/servicios';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BuscadorMascota, type MascotaElegido } from '@/features/agenda/buscador-mascota';
import { fechaISO } from '@/lib/fechas';
import { useCrearServicio, usePreciosEstetica } from './consultas-estetica';

export function DialogoServicio({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      {abierto && <Formulario alCerrar={alCerrar} />}
    </Dialog>
  );
}

function Formulario({ alCerrar }: { alCerrar: () => void }) {
  const hoy = fechaISO();
  const precios = usePreciosEstetica();
  const [mascota, setMascota] = useState<MascotaElegido | null>(null);
  const [f, setF] = useState({ tipo: 'bano' as TipoEstetica, fecha: hoy, precio: '', notas: '' });
  // Si todavía no escribió un precio a mano, se muestra el último de ese servicio
  const [precioTocado, setPrecioTocado] = useState(false);
  const [error, setError] = useState('');
  const guardar = useCrearServicio();
  const sugerido = precios.data?.[f.tipo];
  const precioMostrado = precioTocado ? f.precio : sugerido !== undefined ? pesosParaCampo(sugerido) : '';

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!mascota) return setError('Elegí la mascota.');
    const precio = precioMostrado.trim() === '' ? 0 : leerPesos(precioMostrado);
    if (precio === null) return setError('El precio no es válido. Escribilo como 12.000 o 12000.');
    const datos = { mascotaId: mascota.id, fecha: f.fecha, tipo: f.tipo, precioCentavos: precio, notas: f.notas };
    const r = esquemaServicioEstetica.safeParse(datos);
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(datos, { onSuccess: alCerrar, onError: (err) => setError(err.message) });
  }

  return (
    <DialogContent className="max-w-[520px]">
      <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>Baño o peluquería</DialogTitle>
          <DialogDescription>Aparece en el tablero del día elegido. Se cobra cuando se entrega la mascota.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Campo etiqueta="Mascota">
            <BuscadorMascota valor={mascota} alElegir={(m) => { setMascota(m); setError(''); }} />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Servicio" htmlFor="es-tipo">
              <Select value={f.tipo} onValueChange={(v) => { setF((x) => ({ ...x, tipo: v as TipoEstetica })); setError(''); }}>
                <SelectTrigger id="es-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ESTETICA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NOMBRE_ESTETICA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Precio ($)" htmlFor="es-precio" ayuda={!precioTocado && sugerido !== undefined ? 'El último que se cobró.' : undefined}>
              <Input id="es-precio" inputMode="decimal" value={precioMostrado} onChange={(e) => { setPrecioTocado(true); setF((x) => ({ ...x, precio: e.target.value })); setError(''); }} />
            </Campo>
          </div>
          <Campo etiqueta="Día" htmlFor="es-fecha">
            <Input id="es-fecha" type="date" min={hoy} value={f.fecha} onChange={(e) => { setF((x) => ({ ...x, fecha: e.target.value })); setError(''); }} />
          </Campo>
          <Campo etiqueta="Notas (opcional)" htmlFor="es-notas">
            <Input id="es-notas" maxLength={200} placeholder="Pelo enredado, muerde, alergia a un shampoo…" value={f.notas} onChange={(e) => setF((x) => ({ ...x, notas: e.target.value }))} />
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
