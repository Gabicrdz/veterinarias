// Ventas del mostrador (etapa 4): descuentan stock, se anulan sin borrar y entran al reporte.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaMovimiento, esquemaProducto, esquemaUsuario, esquemaVenta } from '../src/compartido/esquemas';
import { cargarEjemplo, cargarProductosEjemplo } from '../src/main/servicios/ejemplo';
import { cantidadParaReponer, guardarProducto, movimientosDeProducto, obtenerProducto, registrarMovimiento } from '../src/main/servicios/productos';
import { reporte } from '../src/main/servicios/reportes';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { anularVenta, registrarVenta, ventasDelDia } from '../src/main/servicios/ventas';
import { baseNueva } from './ayudantes';

const AHORA = new Date(2026, 10, 16, 11, 30);
const HOY = '2026-11-16';
let db: BaseDeDatos;
let ADMIN: { id: number; rol: 'admin' };
let RECEPCION: { id: number; rol: 'recepcion' };
let alimento: number; // por kilo, $3.800, costo $2.800, 20 kg
let pipeta: number; // por unidad, $9.800, costo $6.500, 3 u

beforeEach(() => {
  db = baseNueva();
  ADMIN = { id: guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Dueña', rol: 'admin', pin: '2222' })), rol: 'admin' };
  RECEPCION = { id: guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Ana', rol: 'recepcion', pin: '1111' })), rol: 'recepcion' };
  alimento = guardarProducto(db, esquemaProducto.parse({ nombre: 'Alimento perro', categoria: 'alimento', unidad: 'kg', costoCentavos: 280000, precioCentavos: 380000, stockMinimo: 5, stockInicial: 20 }), ADMIN, AHORA);
  pipeta = guardarProducto(db, esquemaProducto.parse({ nombre: 'Pipeta', categoria: 'medicamento', costoCentavos: 650000, precioCentavos: 980000, stockMinimo: 2, stockInicial: 3 }), ADMIN, AHORA);
});

const vender = (items: { productoId: number; cantidad: number }[], metodo = 'efectivo', usuario = RECEPCION, ahora = AHORA) =>
  registrarVenta(db, esquemaVenta.parse({ items, metodo }), usuario, ahora);
const stock = (id: number) => obtenerProducto(db, id).stockMilesimas;

describe('registrar venta', () => {
  it('calcula el total, descuenta el stock y deja el precio como foto', () => {
    const id = vender([{ productoId: alimento, cantidad: 1.5 }, { productoId: pipeta, cantidad: 1 }]);
    const dia = ventasDelDia(db, HOY);
    expect(dia.ventas).toHaveLength(1);
    expect(dia.ventas[0]).toMatchObject({ id, totalCentavos: 570000 + 980000, metodo: 'efectivo', usuario: 'Ana', hora: '11:30', anulada: false });
    expect(dia.ventas[0]!.items.map((i) => i.nombre)).toEqual(['Alimento perro', 'Pipeta']);
    expect(stock(alimento)).toBe(18500);
    expect(stock(pipeta)).toBe(2000);
    // Si después sube el precio, la venta vieja no cambia
    guardarProducto(db, esquemaProducto.parse({ id: alimento, nombre: 'Alimento perro', categoria: 'alimento', unidad: 'kg', precioCentavos: 500000 }), ADMIN, AHORA);
    expect(ventasDelDia(db, HOY).ventas[0]!.totalCentavos).toBe(1550000);
  });
  it('junta el mismo producto repetido y controla el stock sobre el total', () => {
    vender([{ productoId: alimento, cantidad: 1 }, { productoId: alimento, cantidad: 2 }]);
    expect(ventasDelDia(db, HOY).ventas[0]!.items).toHaveLength(1);
    expect(stock(alimento)).toBe(17000);
    expect(() => vender([{ productoId: pipeta, cantidad: 2 }, { productoId: pipeta, cantidad: 2 }])).toThrow('No alcanza el stock de Pipeta: hay 3 u');
  });
  it('si un renglón no alcanza, no se vende nada (todo o nada)', () => {
    expect(() => vender([{ productoId: alimento, cantidad: 5 }, { productoId: pipeta, cantidad: 4 }])).toThrow('No alcanza');
    expect(stock(alimento)).toBe(20000);
    expect(ventasDelDia(db, HOY).ventas).toHaveLength(0);
  });
  it('por unidad no se venden fracciones; decimales de más tampoco', () => {
    expect(() => vender([{ productoId: pipeta, cantidad: 1.5 }])).toThrow('por unidad');
    expect(() => vender([{ productoId: alimento, cantidad: 0.0005 }])).toThrow();
  });
  it('no se vende un producto dado de baja', () => {
    db.$client.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(pipeta);
    expect(() => vender([{ productoId: pipeta, cantidad: 1 }])).toThrow('dado de baja');
  });
  it('vender hasta quedar sin stock marca el aviso de reposición', () => {
    expect(cantidadParaReponer(db)).toBe(0);
    vender([{ productoId: pipeta, cantidad: 3 }]);
    expect(obtenerProducto(db, pipeta).estado).toBe('sin_stock');
    expect(cantidadParaReponer(db)).toBe(1);
  });
  it('la validación rechaza ventas vacías o con forma de pago inválida', () => {
    expect(() => esquemaVenta.parse({ items: [], metodo: 'efectivo' })).toThrow('al menos un producto');
    expect(() => esquemaVenta.parse({ items: [{ productoId: 1, cantidad: 1 }], metodo: 'cheque' })).toThrow();
  });
});

describe('anular venta', () => {
  it('devuelve el stock, no borra la venta y deja de sumar en el día', () => {
    const id = vender([{ productoId: alimento, cantidad: 4 }, { productoId: pipeta, cantidad: 1 }]);
    vender([{ productoId: pipeta, cantidad: 1 }], 'transferencia');
    anularVenta(db, id, RECEPCION, AHORA);
    expect(stock(alimento)).toBe(20000);
    expect(stock(pipeta)).toBe(2000);
    const dia = ventasDelDia(db, HOY);
    expect(dia.ventas).toHaveLength(2);
    expect(dia.ventas.find((v) => v.id === id)!.anulada).toBe(true);
    expect(dia.cantidad).toBe(1);
    expect(dia.totalCentavos).toBe(980000);
    expect(dia.porMetodo).toEqual([{ metodo: 'transferencia', centavos: 980000 }]);
    expect(movimientosDeProducto(db, alimento).map((m) => m.tipo)).toEqual(['inicial']); // la salida anulada no figura
    expect(() => anularVenta(db, id, ADMIN, AHORA)).toThrow('ya estaba anulada');
  });
  it('recepción solo anula ventas de hoy; administración, cualquiera', () => {
    const ayer = new Date(2026, 10, 15, 17, 0);
    const id = vender([{ productoId: pipeta, cantidad: 1 }], 'efectivo', RECEPCION, ayer);
    expect(() => anularVenta(db, id, RECEPCION, AHORA)).toThrow('administración');
    anularVenta(db, id, ADMIN, AHORA);
    expect(stock(pipeta)).toBe(3000);
  });
  it('una venta que no existe da un error claro', () => {
    expect(() => anularVenta(db, 999, ADMIN, AHORA)).toThrow('no existe');
  });
});

describe('stock = suma de movimientos', () => {
  it('compras, ventas, mermas y anulaciones se combinan bien', () => {
    registrarMovimiento(db, esquemaMovimiento.parse({ productoId: pipeta, tipo: 'compra', cantidad: 10 }), RECEPCION, AHORA);
    const v = vender([{ productoId: pipeta, cantidad: 6 }]);
    registrarMovimiento(db, esquemaMovimiento.parse({ productoId: pipeta, tipo: 'merma', cantidad: 1, motivo: 'Vencida' }), ADMIN, AHORA);
    expect(stock(pipeta)).toBe(6000);
    anularVenta(db, v, ADMIN, AHORA);
    expect(stock(pipeta)).toBe(12000);
  });
});

describe('reporte e información de ejemplo', () => {
  it('el reporte suma las ventas vigentes, la ganancia y los más vendidos', () => {
    vender([{ productoId: alimento, cantidad: 2 }, { productoId: pipeta, cantidad: 1 }]);
    const anulada = vender([{ productoId: alimento, cantidad: 10 }]);
    anularVenta(db, anulada, ADMIN, AHORA);
    const r = reporte(db, { desde: HOY, hasta: HOY });
    expect(r.productos.ventas).toBe(1);
    expect(r.productos.totalCentavos).toBe(760000 + 980000);
    expect(r.productos.gananciaCentavos).toBe(760000 - 560000 + 980000 - 650000);
    expect(r.productos.masVendidos[0]).toMatchObject({ nombre: 'Pipeta' });
  });
  it('los productos de ejemplo: mismas ventas siempre, sin stock negativo y una sola vez', () => {
    const base = baseNueva();
    const n = cargarProductosEjemplo(base, AHORA);
    expect(n).toBeGreaterThan(20);
    expect(() => cargarProductosEjemplo(base, AHORA)).toThrow('Ya hay productos');
    const negativos = base.$client
      .prepare(`SELECT producto_id, sum(cantidad_milesimas) AS s FROM movimientos_stock WHERE anulado = 0 GROUP BY producto_id HAVING s < 0`)
      .all();
    expect(negativos).toEqual([]);
    expect(cantidadParaReponer(base) >= 3).toBe(true); // la demo muestra stock bajo y sin stock
    expect(cargarProductosEjemplo(baseNueva(), AHORA)).toBe(n);
  });
  it('cargarEjemplo ya trae el mostrador cargado', () => {
    const base = baseNueva();
    cargarEjemplo(base, AHORA);
    expect((base.$client.prepare('SELECT count(*) AS n FROM productos').get() as { n: number }).n).toBeGreaterThan(10);
    expect(ventasDelDia(base, HOY).cantidad).toBeGreaterThan(0);
  });
});
