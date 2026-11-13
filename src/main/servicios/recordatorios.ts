// Recordatorio por WhatsApp: el main arma el enlace wa.me con el mensaje (la
// ventana nunca arma ni abre direcciones de internet) y anota cuándo se mandó.
import type { BaseDeDatos } from '../db/conexion';
import { NOMBRE_DIA } from '@compartido/esquemas';
import { diaDeLaSemana } from '@compartido/horarios';
import { armarMensaje, enlaceWhatsApp, numeroWhatsApp } from '@compartido/whatsapp';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { obtenerVeterinaria } from './veterinaria';
import { obtenerTurno } from './turnos';

type Lector = Pick<BaseDeDatos, '$client'>;

/** El enlace de WhatsApp con el recordatorio ya escrito (no escribe nada en la base). */
export function enlaceRecordatorio(db: Lector, turnoId: number, ahora: Date = new Date()): string {
  const turno = obtenerTurno(db, turnoId);
  if (turno.estado !== 'reservado' && turno.estado !== 'confirmado') throw new ErrorDeUsuario('Solo se recuerdan los turnos pendientes.');
  if (turno.fecha < fechaLocal(ahora)) throw new ErrorDeUsuario('Ese turno ya pasó.');
  if (!turno.telefono.trim()) throw new ErrorDeUsuario(`El dueño de ${turno.mascota} no tiene teléfono cargado. Agregalo en la ficha de la mascota.`);
  const numero = numeroWhatsApp(turno.telefono);
  if (!numero) throw new ErrorDeUsuario(`El teléfono del dueño de ${turno.mascota} (${turno.telefono}) no parece un celular con código de área. Revisalo en la ficha.`);

  const persona = db.$client.prepare('SELECT d.nombre, d.apellido FROM duenos d WHERE d.id = ?').get(turno.duenoId) as { nombre: string; apellido: string };
  const { profesional } = db.$client
    .prepare(`SELECT trim(titulo || ' ' || nombre || ' ' || apellido) AS profesional FROM profesionales WHERE id = ?`)
    .get(turno.profesionalId) as { profesional: string };
  const veterinaria = obtenerVeterinaria(db);
  const mensaje = armarMensaje(veterinaria.mensajeRecordatorio, {
    nombre: persona.nombre,
    mascota: turno.mascota,
    apellido: persona.apellido,
    profesional,
    dia: `${NOMBRE_DIA[diaDeLaSemana(turno.fecha)]} ${turno.fecha.slice(8, 10)}/${turno.fecha.slice(5, 7)}`,
    hora: turno.desde,
    veterinaria: veterinaria.nombreVeterinaria,
    direccion: veterinaria.direccion,
  });
  return enlaceWhatsApp(numero, mensaje);
}

export function marcarRecordado(db: Lector, turnoId: number, ahora: Date = new Date()): void {
  db.$client.prepare('UPDATE turnos SET recordado_en = ? WHERE id = ?').run(momentoLocal(ahora), turnoId);
}
