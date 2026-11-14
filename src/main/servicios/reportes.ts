// Reportes de la veterinaria para un período: cuánto se atendió, cuánto se
// faltó, cuánto se cobró, qué especies se atendieron y qué tan llena estuvo
// la agenda de cada veterinario.
//
// Criterios (para que los números se puedan explicar):
// - Ausentismo = ausentes / (atendidos + ausentes). Los cancelados NO cuentan
//   (avisaron) y los pendientes tampoco (todavía no se sabe).
// - Ingresos = lo que pagaron los dueños por las consultas, según
//   el día del TURNO, con cobros no anulados.
// - Ocupación = turnos dados (no cancelados) / turnos que entraban según el
//   horario de cada día, sin contar los días sin atención.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaPeriodo } from '@compartido/esquemas';
import { METODOS } from '@compartido/esquemas';
import { diaDeLaSemana, horariosDeTurno } from '@compartido/horarios';
import type { ColorProfesional, MetodoPago, Reporte } from '@compartido/tipos';
import { fechaLocal } from './fechas';
import { estaBloqueado } from './bloqueos';
import { listarProfesionales } from './profesionales';

type Lector = Pick<BaseDeDatos, '$client'>;
type Periodo = z.output<typeof esquemaPeriodo>;

const proporcion = (parte: number, total: number) => (total > 0 ? parte / total : null);

/** Cada día del período, como 'AAAA-MM-DD'. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${desde}T12:00:00`);
  for (let f = fechaLocal(d); f <= hasta; d.setDate(d.getDate() + 1), f = fechaLocal(d)) dias.push(f);
  return dias;
}

export function reporte(db: Lector, periodo: Periodo): Reporte {
  const { desde, hasta } = periodo;
  const c = db.$client;
  const p = [desde, hasta];

  // ---- Totales ----
  const t = c
    .prepare(
      `SELECT count(*) FILTER (WHERE estado <> 'cancelado') AS turnos,
              count(*) FILTER (WHERE estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE estado = 'ausente') AS ausentes,
              count(*) FILTER (WHERE estado = 'cancelado') AS cancelados,
              count(DISTINCT mascota_id) FILTER (WHERE estado = 'atendido') AS mascotasAtendidos
       FROM turnos WHERE fecha BETWEEN ? AND ?`,
    )
    .get(...p) as { turnos: number; atendidos: number; ausentes: number; cancelados: number; mascotasAtendidos: number };

  const cobros = c
    .prepare(
      `SELECT co.metodo, co.monto_centavos AS monto
       FROM cobros co JOIN turnos t ON t.id = co.turno_id
       WHERE co.anulado = 0 AND t.fecha BETWEEN ? AND ?`,
    )
    .all(...p) as { metodo: MetodoPago | null; monto: number }[];

  const porMetodo = METODOS.map((m) => {
    const delMetodo = cobros.filter((x) => x.metodo === m);
    return { metodo: m, centavos: delMetodo.reduce((s, x) => s + x.monto, 0), cantidad: delMetodo.length };
  }).filter((x) => x.cantidad > 0);

  const { sinCobrar } = c
    .prepare(
      `SELECT count(*) AS sinCobrar FROM turnos t
       WHERE t.estado = 'atendido' AND t.fecha BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM cobros co WHERE co.turno_id = t.id AND co.anulado = 0)`,
    )
    .get(...p) as { sinCobrar: number };

  // Nuevos: su primera atención (de toda la historia) cae en el período
  const { nuevos } = c
    .prepare(
      `SELECT count(*) AS nuevos FROM (
         SELECT mascota_id, min(fecha) AS primera FROM turnos WHERE estado = 'atendido' GROUP BY mascota_id
       ) WHERE primera BETWEEN ? AND ?`,
    )
    .get(...p) as { nuevos: number };

  // ---- Por profesional ----
  const filasProf = c
    .prepare(
      `SELECT t.profesional_id AS id,
              count(*) FILTER (WHERE t.estado <> 'cancelado') AS turnos,
              count(*) FILTER (WHERE t.estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              coalesce(sum(co.monto_centavos), 0) AS ingresos
       FROM turnos t LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.profesional_id`,
    )
    .all(...p) as { id: number; turnos: number; atendidos: number; ausentes: number; ingresos: number }[];
  const dias = diasDelPeriodo(desde, hasta);
  const porProfesional = listarProfesionales(db)
    .map((prof) => {
      const f = filasProf.find((x) => x.id === prof.id) ?? { turnos: 0, atendidos: 0, ausentes: 0, ingresos: 0 };
      // Cuántos turnos entraban: día por día, según su horario y sin días sin atención
      const disponibles = prof.activo
        ? dias.reduce((suma, dia) => {
            const franjas = prof.horarios.filter((h) => h.diaSemana === diaDeLaSemana(dia));
            if (!franjas.length || estaBloqueado(db, prof.id, dia)) return suma;
            return suma + horariosDeTurno(franjas, prof.duracionTurnoMin).length;
          }, 0)
        : 0;
      return {
        profesionalId: prof.id,
        nombre: `${prof.titulo} ${prof.nombre} ${prof.apellido}`.trim(),
        color: prof.color as ColorProfesional,
        turnos: f.turnos,
        atendidos: f.atendidos,
        ausentes: f.ausentes,
        ausentismo: proporcion(f.ausentes, f.atendidos + f.ausentes),
        disponibles,
        ocupacion: disponibles > 0 ? Math.min(1, f.turnos / disponibles) : null,
        ingresosCentavos: f.ingresos,
      };
    })
    // Sin turnos ni horario en el período, no aporta nada
    .filter((x) => x.turnos > 0 || x.disponibles > 0);

  // ---- Por especie (de lo atendido) ----
  const porEspecie = c
    .prepare(
      `SELECT m.especie, count(*) AS atenciones, coalesce(sum(co.monto_centavos), 0) AS montoCentavos
       FROM turnos t
       JOIN mascotas m ON m.id = t.mascota_id
       LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.estado = 'atendido' AND t.fecha BETWEEN ? AND ?
       GROUP BY m.especie
       ORDER BY atenciones DESC, m.especie`,
    )
    .all(...p) as Reporte['porEspecie'];

  // ---- Por día ----
  const filasDia = c
    .prepare(
      `SELECT t.fecha,
              count(*) FILTER (WHERE t.estado = 'atendido') AS atendidos,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              coalesce(sum(co.monto_centavos), 0) AS ingresosCentavos
       FROM turnos t LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY t.fecha`,
    )
    .all(...p) as Reporte['porDia'];
  const porDia = dias.map((fecha) => filasDia.find((d) => d.fecha === fecha) ?? { fecha, atendidos: 0, ausentes: 0, ingresosCentavos: 0 });

  // ---- Los que más faltan (para llamarlos o recordarles con tiempo) ----
  const faltadores = c
    .prepare(
      `SELECT pa.id AS mascotaId, pa.nombre AS mascota, d.apellido || ', ' || d.nombre AS dueno, d.telefono,
              count(*) FILTER (WHERE t.estado = 'ausente') AS ausentes,
              count(*) FILTER (WHERE t.estado <> 'cancelado') AS turnos
       FROM turnos t JOIN mascotas pa ON pa.id = t.mascota_id JOIN duenos d ON d.id = pa.dueno_id
       WHERE t.fecha BETWEEN ? AND ?
       GROUP BY pa.id
       HAVING ausentes >= 2
       ORDER BY ausentes DESC, mascota
       LIMIT 8`,
    )
    .all(...p) as Reporte['faltadores'];

  // ---- Ventas del mostrador (productos): aparte de las consultas, para no mezclar los números ----
  const v = c
    .prepare(
      `SELECT count(DISTINCT ve.id) AS ventas, coalesce(sum(i.subtotal_centavos), 0) AS total,
              coalesce(sum(i.subtotal_centavos - round(i.cantidad_milesimas * i.costo_centavos / 1000.0)), 0) AS ganancia
       FROM ventas ve JOIN venta_items i ON i.venta_id = ve.id
       WHERE ve.anulada = 0 AND ve.fecha BETWEEN ? AND ?`,
    )
    .get(...p) as { ventas: number; total: number; ganancia: number };
  const masVendidos = c
    .prepare(
      `SELECT i.producto_id AS productoId, pr.nombre, pr.unidad, sum(i.cantidad_milesimas) AS cantidadMilesimas, sum(i.subtotal_centavos) AS totalCentavos
       FROM ventas ve JOIN venta_items i ON i.venta_id = ve.id JOIN productos pr ON pr.id = i.producto_id
       WHERE ve.anulada = 0 AND ve.fecha BETWEEN ? AND ?
       GROUP BY i.producto_id
       ORDER BY totalCentavos DESC, pr.nombre
       LIMIT 5`,
    )
    .all(...p) as Reporte['productos']['masVendidos'];

  return {
    desde,
    hasta,
    totales: {
      turnos: t.turnos,
      atendidos: t.atendidos,
      ausentes: t.ausentes,
      cancelados: t.cancelados,
      ausentismo: proporcion(t.ausentes, t.atendidos + t.ausentes),
      ingresosCentavos: cobros.reduce((s, x) => s + x.monto, 0),
      porMetodo,
      atendidosSinCobrar: sinCobrar,
      mascotasAtendidos: t.mascotasAtendidos,
      mascotasNuevos: nuevos,
    },
    porProfesional,
    porEspecie,
    porDia,
    productos: { ventas: v.ventas, totalCentavos: v.total, gananciaCentavos: v.ganancia, masVendidos },
    faltadores,
  };
}

// ---------- Exportar atenciones (para el contador o para llevar el control) ----------
export interface FilaAtencion {
  fecha: string;
  mascota: string;
  especie: string;
  dueno: string;
  veterinario: string;
  montoCentavos: number;
  metodo: string;
}

/** Las atenciones del período, con lo que se cobró en cada una. */
export function atencionesDelPeriodo(db: Lector, periodo: Periodo): FilaAtencion[] {
  return db.$client
    .prepare(
      `SELECT t.fecha, m.nombre AS mascota, m.especie, d.apellido || ', ' || d.nombre AS dueno,
              trim(pr.titulo || ' ' || pr.nombre || ' ' || pr.apellido) AS veterinario,
              coalesce(co.monto_centavos, 0) AS montoCentavos, coalesce(co.metodo, '') AS metodo
       FROM turnos t
       JOIN mascotas m ON m.id = t.mascota_id
       JOIN duenos d ON d.id = m.dueno_id
       JOIN profesionales pr ON pr.id = t.profesional_id
       LEFT JOIN cobros co ON co.turno_id = t.id AND co.anulado = 0
       WHERE t.estado = 'atendido' AND t.fecha BETWEEN ? AND ?
       ORDER BY t.fecha, t.desde`,
    )
    .all(periodo.desde, periodo.hasta) as FilaAtencion[];
}

/**
 * CSV para Excel en español: separado por ";" (la coma es el decimal), con
 * BOM al principio (para que Excel lea bien las tildes) y comillas donde haga falta.
 */
export function csvDeAtenciones(filas: FilaAtencion[]): string {
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const encabezado = ['Fecha', 'Mascota', 'Especie', 'Dueño', 'Veterinario', 'Cobrado', 'Método'];
  const lineas = filas.map((f) =>
    [
      `${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}/${f.fecha.slice(0, 4)}`,
      f.mascota,
      f.especie,
      f.dueno,
      f.veterinario,
      (f.montoCentavos / 100).toFixed(2).replace('.', ','),
      f.metodo,
    ]
      .map(celda)
      .join(';'),
  );
  return '\ufeff' + [encabezado.join(';'), ...lineas].join('\r\n') + '\r\n';
}
