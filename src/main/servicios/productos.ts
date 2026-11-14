// Productos y stock. El stock NO se guarda en el producto: es la suma de sus
// movimientos vigentes (entradas y salidas). Así siempre se puede explicar de
// dónde sale el número, y una venta anulada devuelve su mercadería sola.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaBuscarProductos, esquemaMovimiento, esquemaProducto } from '@compartido/esquemas';
import {
  NOMBRE_CATEGORIA,
  aMilesimas,
  cantidadConUnidad,
  cantidadValida,
  estadoDeStock,
  type CategoriaProducto,
  type TipoMovimiento,
} from '@compartido/productos';
import type { MovimientoStock, Producto, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, momentoLocal } from './fechas';
import { escaparLike, normalizar } from './texto';

type Lector = Pick<BaseDeDatos, '$client'>;

// El producto con su stock actual (suma de movimientos vigentes)
const SELECT_PRODUCTO = `
  SELECT p.id, p.codigo, p.nombre, p.categoria, p.unidad, p.costo_centavos AS costoCentavos, p.precio_centavos AS precioCentavos,
         p.stock_minimo_milesimas AS stockMinimoMilesimas, p.activo,
         coalesce((SELECT sum(m.cantidad_milesimas) FROM movimientos_stock m WHERE m.producto_id = p.id AND m.anulado = 0), 0) AS stockMilesimas
  FROM productos p`;

type Fila = Omit<Producto, 'estado' | 'activo'> & { activo: number };
const aProducto = (f: Fila): Producto => ({ ...f, activo: f.activo === 1, estado: estadoDeStock(f.stockMilesimas, f.stockMinimoMilesimas) });

const collator = new Intl.Collator('es', { sensitivity: 'base' });

export function obtenerProducto(db: Lector, id: number): Producto {
  const f = db.$client.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(id) as Fila | undefined;
  if (!f) throw new ErrorDeUsuario('Ese producto no existe.');
  return aProducto(f);
}

const textoDeBusqueda = (nombre: string, codigo: string | null, categoria: CategoriaProducto) =>
  normalizar(`${nombre} ${codigo ?? ''} ${NOMBRE_CATEGORIA[categoria]}`);

/** Busca por nombre, código o categoría (sin tildes, varias palabras); ordenados por nombre. */
export function buscarProductos(db: Lector, filtro: z.output<typeof esquemaBuscarProductos>): Producto[] {
  const palabras = normalizar(filtro.texto).split(/\s+/).filter(Boolean);
  const condiciones = palabras.map(() => `p.busqueda LIKE ? ESCAPE '\\'`);
  if (filtro.categoria) condiciones.push('p.categoria = ?');
  if (!filtro.incluirBajas) condiciones.push('p.activo = 1');
  const parametros = [...palabras.map((w) => `%${escaparLike(w)}%`), ...(filtro.categoria ? [filtro.categoria] : [])];
  const filas = db.$client
    .prepare(`${SELECT_PRODUCTO} ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}`)
    .all(...parametros) as Fila[];
  return filas
    .map(aProducto)
    .filter((p) => filtro.estado === 'todos' || (filtro.estado === 'bajo' ? p.estado === 'bajo' : p.estado === 'sin_stock'))
    .sort((a, b) => collator.compare(a.nombre, b.nombre));
}

/** Cuántos productos activos hay que reponer (stock bajo o sin stock): el número del menú. */
export function cantidadParaReponer(db: Lector): number {
  return buscarProductos(db, { texto: '', categoria: null, estado: 'todos', incluirBajas: false }).filter((p) => p.estado !== 'ok').length;
}

function validarCantidades(datos: z.output<typeof esquemaProducto>): void {
  const medida = (valor: number, campo: string) => {
    const m = aMilesimas(valor);
    if (datos.unidad === 'unidad' && m % 1000 !== 0) throw new ErrorDeUsuario(`${campo}: este producto se vende por unidad, escribí un número entero.`);
    if (Math.abs(valor * 1000 - m) > 1e-6) throw new ErrorDeUsuario(`${campo}: como mucho 3 decimales (gramos).`);
  };
  medida(datos.stockMinimo, 'El stock mínimo');
  if (datos.id === undefined) medida(datos.stockInicial, 'El stock inicial');
}

/**
 * Crea o edita un producto. Al crear, el stock inicial es el primer movimiento (en
 * la misma transacción). Al editar NUNCA se toca el stock: para eso están los movimientos.
 */
export function guardarProducto(db: BaseDeDatos, datos: z.output<typeof esquemaProducto>, usuario: Pick<Usuario, 'id'> | null = null, ahora: Date = new Date()): number {
  validarCantidades(datos);
  if (datos.codigo) {
    const otro = db.$client.prepare('SELECT id, nombre FROM productos WHERE codigo = ? AND id IS NOT ?').get(datos.codigo, datos.id ?? null) as { id: number; nombre: string } | undefined;
    if (otro) throw new ErrorDeUsuario(`Ese código ya es de ${otro.nombre}.`);
  }
  const busqueda = textoDeBusqueda(datos.nombre, datos.codigo, datos.categoria);
  const minimo = aMilesimas(datos.stockMinimo);

  return db.$client.transaction(() => {
    if (datos.id !== undefined) {
      const actual = obtenerProducto(db, datos.id);
      if (actual.unidad === 'kg' && datos.unidad === 'unidad') {
        const fraccion = db.$client.prepare('SELECT 1 FROM movimientos_stock WHERE producto_id = ? AND cantidad_milesimas % 1000 <> 0 LIMIT 1').get(datos.id);
        if (fraccion || actual.stockMilesimas % 1000 !== 0) throw new ErrorDeUsuario('No se puede pasar a "por unidad": tiene movimientos con fracciones de kilo.');
      }
      db.$client
        .prepare(
          `UPDATE productos SET codigo = ?, nombre = ?, categoria = ?, unidad = ?, costo_centavos = ?, precio_centavos = ?, stock_minimo_milesimas = ?, busqueda = ? WHERE id = ?`,
        )
        .run(datos.codigo, datos.nombre, datos.categoria, datos.unidad, datos.costoCentavos, datos.precioCentavos, minimo, busqueda, datos.id);
      return datos.id;
    }
    const id = Number(
      db.$client
        .prepare(
          `INSERT INTO productos (codigo, nombre, categoria, unidad, costo_centavos, precio_centavos, stock_minimo_milesimas, busqueda, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(datos.codigo, datos.nombre, datos.categoria, datos.unidad, datos.costoCentavos, datos.precioCentavos, minimo, busqueda, momentoLocal(ahora)).lastInsertRowid,
    );
    if (datos.stockInicial > 0) {
      db.$client
        .prepare(`INSERT INTO movimientos_stock (producto_id, tipo, cantidad_milesimas, costo_centavos, fecha, usuario_id, creado_en) VALUES (?, 'inicial', ?, ?, ?, ?, ?)`)
        .run(id, aMilesimas(datos.stockInicial), datos.costoCentavos, fechaLocal(ahora), usuario?.id ?? null, momentoLocal(ahora));
    }
    return id;
  })();
}

/** Baja lógica: el producto deja de ofrecerse en el mostrador pero queda en las ventas viejas. */
export function cambiarActivoProducto(db: BaseDeDatos, id: number, activo: boolean): void {
  obtenerProducto(db, id);
  db.$client.prepare('UPDATE productos SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
}

/**
 * Entrada por compra, merma (rotura o vencimiento) o ajuste por conteo. Una salida
 * nunca deja el stock en negativo. En el ajuste se escribe lo CONTADO y se guarda la diferencia.
 */
export function registrarMovimiento(
  db: BaseDeDatos,
  datos: z.output<typeof esquemaMovimiento>,
  usuario: Pick<Usuario, 'id' | 'rol'>,
  ahora: Date = new Date(),
): number {
  if (datos.tipo !== 'compra' && usuario.rol !== 'admin') {
    throw new ErrorDeUsuario('Las mermas y los ajustes de stock los carga administración.');
  }
  const producto = obtenerProducto(db, datos.productoId);
  if (!producto.activo) throw new ErrorDeUsuario(`${producto.nombre} está dado de baja. Reactivalo para moverle el stock.`);
  const milesimas = aMilesimas(datos.cantidad);
  if (Math.abs(datos.cantidad * 1000 - milesimas) > 1e-6) throw new ErrorDeUsuario('La cantidad: como mucho 3 decimales (gramos).');

  let delta: number;
  if (datos.tipo === 'ajuste') {
    // Se puede contar 0 (no queda nada); por unidad, enteros
    if (producto.unidad === 'unidad' && milesimas % 1000 !== 0) throw new ErrorDeUsuario(`${producto.nombre} se cuenta por unidad: escribí un número entero.`);
    delta = milesimas - producto.stockMilesimas;
    if (delta === 0) throw new ErrorDeUsuario(`El stock de ${producto.nombre} ya es ${cantidadConUnidad(milesimas, producto.unidad)}: no hay nada para ajustar.`);
  } else {
    if (!cantidadValida(milesimas, producto.unidad)) {
      throw new ErrorDeUsuario(producto.unidad === 'unidad' ? `${producto.nombre} se mueve por unidad: escribí un número entero mayor que cero.` : 'Escribí una cantidad mayor que cero.');
    }
    delta = datos.tipo === 'compra' ? milesimas : -milesimas;
    if (producto.stockMilesimas + delta < 0) {
      throw new ErrorDeUsuario(`No alcanza: de ${producto.nombre} hay ${cantidadConUnidad(producto.stockMilesimas, producto.unidad)} y querés sacar ${cantidadConUnidad(milesimas, producto.unidad)}.`);
    }
  }

  return db.$client.transaction(() => {
    const id = Number(
      db.$client
        .prepare(`INSERT INTO movimientos_stock (producto_id, tipo, cantidad_milesimas, costo_centavos, motivo, fecha, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(producto.id, datos.tipo, delta, datos.tipo === 'compra' ? (datos.costoCentavos ?? producto.costoCentavos) : null, datos.motivo, fechaLocal(ahora), usuario.id, momentoLocal(ahora)).lastInsertRowid,
    );
    // Una compra con costo nuevo actualiza el costo del producto (el precio de venta lo decide el dueño)
    if (datos.tipo === 'compra' && datos.costoCentavos !== null) {
      db.$client.prepare('UPDATE productos SET costo_centavos = ? WHERE id = ?').run(datos.costoCentavos, producto.id);
    }
    return id;
  })();
}

/** Últimos movimientos vigentes del producto, del más nuevo al más viejo. */
export function movimientosDeProducto(db: Lector, productoId: number, limite = 40): MovimientoStock[] {
  return db.$client
    .prepare(
      `SELECT m.id, m.tipo, m.cantidad_milesimas AS cantidadMilesimas, m.costo_centavos AS costoCentavos, m.motivo, m.fecha,
              m.venta_id AS ventaId, coalesce(u.nombre, '') AS usuario
       FROM movimientos_stock m LEFT JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.producto_id = ? AND m.anulado = 0
       ORDER BY m.fecha DESC, m.id DESC LIMIT ?`,
    )
    .all(productoId, limite) as (Omit<MovimientoStock, 'tipo'> & { tipo: TipoMovimiento })[];
}
