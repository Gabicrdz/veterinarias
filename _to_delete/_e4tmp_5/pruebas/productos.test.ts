// Productos, stock y movimientos (etapa 4).
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaBuscarProductos, esquemaMovimiento, esquemaProducto, esquemaUsuario, type DatosProducto } from '../src/compartido/esquemas';
import { aMilesimas, cantidadConUnidad, cantidadValida, estadoDeStock, subtotalDe } from '../src/compartido/productos';
import { buscarProductos, cambiarActivoProducto, cantidadParaReponer, guardarProducto, movimientosDeProducto, obtenerProducto, registrarMovimiento } from '../src/main/servicios/productos';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { baseNueva } from './ayudantes';

const AHORA = new Date(2026, 10, 16, 9, 0);
let db: BaseDeDatos;
let ADMIN: { id: number; rol: 'admin' };
let RECEPCION: { id: number; rol: 'recepcion' };

beforeEach(() => {
  db = baseNueva();
  ADMIN = { id: guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Dueña', rol: 'admin', pin: '2222' })), rol: 'admin' };
  RECEPCION = { id: guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Ana', rol: 'recepcion', pin: '1111' })), rol: 'recepcion' };
});

const crear = (datos: Partial<DatosProducto> = {}) =>
  guardarProducto(db, esquemaProducto.parse({ nombre: 'Alimento perro', categoria: 'alimento', unidad: 'kg', costoCentavos: 280000, precioCentavos: 380000, stockMinimo: 5, stockInicial: 20, ...datos }), ADMIN, AHORA);
const mover = (productoId: number, tipo: 'compra' | 'merma' | 'ajuste', cantidad: number, usuario: { id: number; rol: 'admin' | 'recepcion' } = ADMIN, extra = {}) =>
  registrarMovimiento(db, esquemaMovimiento.parse({ productoId, tipo, cantidad, ...extra }), usuario, AHORA);

describe('cantidades y estados', () => {
  it('guarda en milésimas y calcula subtotales redondeando al centavo', () => {
    expect(aMilesimas(1.5)).toBe(1500);
    expect(aMilesimas(0.1 + 0.2)).toBe(300);
    expect(subtotalDe(1500, 380000)).toBe(570000);
    expect(subtotalDe(333, 1000)).toBe(333);
  });
  it('por unidad solo enteros; por kilo, cualquier cantidad mayor que cero', () => {
    expect(cantidadValida(2000, 'unidad')).toBe(true);
    expect(cantidadValida(1500, 'unidad')).toBe(false);
    expect(cantidadValida(1500, 'kg')).toBe(true);
    expect(cantidadValida(0, 'kg')).toBe(false);
  });
  it('estado: sin stock, bajo (en el mínimo o debajo) y ok', () => {
    expect(estadoDeStock(0, 5000)).toBe('sin_stock');
    expect(estadoDeStock(5000, 5000)).toBe('bajo');
    expect(estadoDeStock(5001, 5000)).toBe('ok');
    expect(estadoDeStock(1000, 0)).toBe('ok'); // mínimo 0 = sin aviso
    expect(cantidadConUnidad(1500, 'kg')).toBe('1,5 kg');
  });
});

describe('alta y edición', () => {
  it('crea con stock inicial como un movimiento, no como un número guardado', () => {
    const id = crear();
    const p = obtenerProducto(db, id);
    expect(p.stockMilesimas).toBe(20000);
    expect(p.estado).toBe('ok');
    expect(movimientosDeProducto(db, id).map((m) => m.tipo)).toEqual(['inicial']);
  });
  it('editar nunca toca el stock', () => {
    const id = crear();
    guardarProducto(db, esquemaProducto.parse({ id, nombre: 'Alimento perro adulto', categoria: 'alimento', unidad: 'kg', precioCentavos: 400000, stockInicial: 999 }), ADMIN, AHORA);
    const p = obtenerProducto(db, id);
    expect(p.nombre).toBe('Alimento perro adulto');
    expect(p.precioCentavos).toBe(400000);
    expect(p.stockMilesimas).toBe(20000);
  });
  it('el precio es obligatorio y el código no se repite', () => {
    expect(() => esquemaProducto.parse({ nombre: 'X', categoria: 'otro', precioCentavos: 0 })).toThrow('precio');
    crear({ codigo: '779000' });
    expect(() => crear({ nombre: 'Otro', codigo: '779000' })).toThrow('Ese código ya es de Alimento perro');
    expect(crear({ nombre: 'Sin código A', codigo: '' })).toBeGreaterThan(0);
    expect(crear({ nombre: 'Sin código B', codigo: '' })).toBeGreaterThan(0); // varios sin código sí se puede
  });
  it('por unidad no admite decimales en el stock inicial', () => {
    expect(() => crear({ unidad: 'unidad', stockInicial: 2.5 })).toThrow('entero');
  });
  it('no se pasa de kilo a unidad si hay fracciones', () => {
    const id = crear({ stockInicial: 2.5 });
    expect(() => guardarProducto(db, esquemaProducto.parse({ id, nombre: 'Alimento perro', categoria: 'alimento', unidad: 'unidad', precioCentavos: 380000 }), ADMIN, AHORA)).toThrow('fracciones');
  });
});

describe('movimientos', () => {
  it('una compra suma y puede actualizar el costo', () => {
    const id = crear();
    mover(id, 'compra', 10, RECEPCION, { costoCentavos: 300000 });
    const p = obtenerProducto(db, id);
    expect(p.stockMilesimas).toBe(30000);
    expect(p.costoCentavos).toBe(300000);
  });
  it('recepción solo puede cargar compras; merma y ajuste son de administración', () => {
    const id = crear();
    expect(() => mover(id, 'merma', 1, RECEPCION)).toThrow('administración');
    expect(() => mover(id, 'ajuste', 5, RECEPCION)).toThrow('administración');
    expect(obtenerProducto(db, id).stockMilesimas).toBe(20000);
  });
  it('la merma resta y nunca deja el stock en negativo', () => {
    const id = crear();
    mover(id, 'merma', 2.5, ADMIN, { motivo: 'Bolsa rota' });
    expect(obtenerProducto(db, id).stockMilesimas).toBe(17500);
    expect(() => mover(id, 'merma', 100)).toThrow('No alcanza');
  });
  it('el ajuste usa lo CONTADO y guarda la diferencia', () => {
    const id = crear();
    mover(id, 'ajuste', 18);
    expect(obtenerProducto(db, id).stockMilesimas).toBe(18000);
    expect(movimientosDeProducto(db, id)[0]).toMatchObject({ tipo: 'ajuste', cantidadMilesimas: -2000 });
    expect(() => mover(id, 'ajuste', 18)).toThrow('nada para ajustar');
    mover(id, 'ajuste', 0);
    expect(obtenerProducto(db, id).estado).toBe('sin_stock');
  });
  it('por unidad no acepta fracciones en compras', () => {
    const id = crear({ unidad: 'unidad' });
    expect(() => mover(id, 'compra', 1.5)).toThrow('entero');
  });
  it('un producto dado de baja no recibe movimientos', () => {
    const id = crear();
    cambiarActivoProducto(db, id, false);
    expect(() => mover(id, 'compra', 1)).toThrow('dado de baja');
  });
});

describe('búsqueda y aviso de reposición', () => {
  beforeEach(() => {
    crear({ nombre: 'Alimento perro adulto', codigo: '111', stockInicial: 20 });
    crear({ nombre: 'Pipeta gato', categoria: 'medicamento', unidad: 'unidad', codigo: '222', stockMinimo: 6, stockInicial: 4 });
    crear({ nombre: 'Collar antipulgas', categoria: 'medicamento', unidad: 'unidad', stockMinimo: 4, stockInicial: 0 });
  });
  const buscar = (f: object) => buscarProductos(db, esquemaBuscarProductos.parse(f)).map((p) => p.nombre);
  it('busca sin importar mayúsculas ni tildes, por nombre o por código', () => {
    expect(buscar({ texto: 'ALIMENTO' })).toEqual(['Alimento perro adulto']);
    expect(buscar({ texto: 'pipeta gato' })).toEqual(['Pipeta gato']);
    expect(buscar({ texto: '222' })).toEqual(['Pipeta gato']);
  });
  it('filtra por categoría y por estado de stock', () => {
    expect(buscar({ categoria: 'medicamento' })).toEqual(['Collar antipulgas', 'Pipeta gato']);
    expect(buscar({ estado: 'bajo' })).toEqual(['Pipeta gato']);
    expect(buscar({ estado: 'sin_stock' })).toEqual(['Collar antipulgas']);
  });
  it('cuenta los que hay que reponer (bajos y sin stock) y esconde las bajas', () => {
    expect(cantidadParaReponer(db)).toBe(2);
    const id = buscarProductos(db, esquemaBuscarProductos.parse({ texto: 'collar' }))[0]!.id;
    cambiarActivoProducto(db, id, false);
    expect(cantidadParaReponer(db)).toBe(1);
    expect(buscar({})).not.toContain('Collar antipulgas');
    expect(buscar({ incluirBajas: true })).toContain('Collar antipulgas');
  });
});
