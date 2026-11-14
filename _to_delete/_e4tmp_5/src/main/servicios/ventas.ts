// Ventas del mostrador. Una venta descuenta el stock de cada producto en la misma
// transacción (o no pasa nada). Anularla devuelve la mercadería: los movimientos de
// stock de esa venta se marcan como anulados y el stock, que es una suma, se corrige solo.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaVenta } from '@compartido/esquemas';
import { METODOS } from '@compartido/esquemas';
import { aMilesimas, cantidadConUnidad, cantidadValida, subtotalDe, type Unidad } from '@compartido/productos';
import type { ItemDeVenta, MetodoPago, Usuario, Venta, VentasDelDia } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { obtenerProducto } from './productos';

type Lector = Pick<BaseDeDatos, '$client'>;

export function registrarVenta(db: BaseDeDatos, datos: z.output<typeof esquemaVenta>, usuario: Pick<Usuario, 'id'> | null, ahora: Date = new Date()): number {
  // El mismo producto dos veces se junta en un renglón: el stock se controla sobre el total
  const pedido = new Map<number, number>();
  for (const it of datos.items) {
    const milesimas = aMilesimas(it.cantidad);
    if (Math.abs(it.cantidad * 1000 - milesimas) > 1e-6) throw new ErrorDeUsuario('La cantidad: como mucho 3 decimales (gramos).');
    pedido.set(it.productoId, (pedido.get(it.productoId) ?? 0) + milesimas);
  }

  const fecha = fechaLocal(ahora);
  const momento = momentoLocal(ahora);
  return db.$client.transaction(() => {
    const renglones = [...pedido].map(([productoId, milesimas]) => {
      const p = obtenerProducto(db, productoId);
      if (!p.activo) throw new ErrorDeUsuario(`${p.nombre} está dado de baja: no se puede vender.`);
      if (!cantidadValida(milesimas, p.unidad)) {
        throw new ErrorDeUsuario(`${p.nombre} se vende por unidad: no se puede vender ${cantidadConUnidad(milesimas, p.unidad)}.`);
      }
      if (p.stockMilesimas < milesimas) {
        throw new ErrorDeUsuario(`No alcanza el stock de ${p.nombre}: hay ${cantidadConUnidad(p.stockMilesimas, p.unidad)} y querés vender ${cantidadConUnidad(milesimas, p.unidad)}.`);
      }
      return { p, milesimas, subtotal: subtotalDe(milesimas, p.precioCentavos) };
    });
    const total = renglones.reduce((s, r) => s + r.subtotal, 0);

    const ventaId = Number(
      db.$client
        .prepare('INSERT INTO ventas (fecha, total_centavos, metodo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)')
        .run(fecha, total, datos.metodo, usuario?.id ?? null, momento).lastInsertRowid,
    );
    const item = db.$client.prepare(
      'INSERT INTO venta_items (venta_id, producto_id, nombre, cantidad_milesimas, precio_centavos, costo_centavos, subtotal_centavos) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const salida = db.$client.prepare(
      `INSERT INTO movimientos_stock (producto_id, tipo, cantidad_milesimas, costo_centavos, fecha, venta_id, usuario_id, creado_en) VALUES (?, 'venta', ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of renglones) {
      item.run(ventaId, r.p.id, r.p.nombre, r.milesimas, r.p.precioCentavos, r.p.costoCentavos, r.subtotal);
      salida.run(r.p.id, -r.milesimas, r.p.costoCentavos, fecha, ventaId, usuario?.id ?? null, momento);
    }
    return ventaId;
  })();
}

/** Se anula, no se borra. Administración puede anular cualquiera; el resto, solo las de hoy. */
export function anularVenta(db: BaseDeDatos, id: number, usuario: Pick<Usuario, 'rol'>, ahora: Date = new Date()): void {
  const v = db.$client.prepare('SELECT fecha, anulada FROM ventas WHERE id = ?').get(id) as { fecha: string; anulada: number } | undefined;
  if (!v) throw new ErrorDeUsuario('Esa venta no existe.');
  if (v.anulada) throw new ErrorDeUsuario('Esa venta ya estaba anulada.');
  if (usuario.rol !== 'admin' && v.fecha !== fechaLocal(ahora)) throw new ErrorDeUsuario('Las ventas de días anteriores las anula administración.');
  db.$client.transaction(() => {
    db.$client.prepare('UPDATE ventas SET anulada = 1, anulada_en = ? WHERE id = ?').run(momentoLocal(ahora), id);
    db.$client.prepare('UPDATE movimientos_stock SET anulado = 1 WHERE venta_id = ?').run(id);
  })();
}

/** Las ventas de un día (la más nueva primero) y sus totales, sin contar las anuladas. */
export function ventasDelDia(db: Lector, fecha: string): VentasDelDia {
  const filas = db.$client
    .prepare(
      `SELECT v.id, v.fecha, substr(v.creado_en, 12, 5) AS hora, v.total_centavos AS totalCentavos, v.metodo, v.anulada, coalesce(u.nombre, '') AS usuario
       FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.fecha = ? ORDER BY v.id DESC`,
    )
    .all(fecha) as (Omit<Venta, 'anulada' | 'items'> & { anulada: number })[];
  const items = db.$client.prepare(
    `SELECT i.producto_id AS productoId, i.nombre, p.unidad, i.cantidad_milesimas AS cantidadMilesimas, i.precio_centavos AS precioCentavos, i.subtotal_centavos AS subtotalCentavos
     FROM venta_items i JOIN productos p ON p.id = i.producto_id WHERE i.venta_id = ? ORDER BY i.id`,
  );
  const ventas: Venta[] = filas.map((f) => ({ ...f, anulada: f.anulada === 1, items: items.all(f.id) as (ItemDeVenta & { unidad: Unidad })[] }));
  const vigentes = ventas.filter((v) => !v.anulada);
  const porMetodo = METODOS.map((metodo: MetodoPago) => ({ metodo, centavos: vigentes.filter((v) => v.metodo === metodo).reduce((s, v) => s + v.totalCentavos, 0) })).filter((m) => m.centavos > 0);
  return { fecha, ventas, totalCentavos: vigentes.reduce((s, v) => s + v.totalCentavos, 0), cantidad: vigentes.length, porMetodo };
}
