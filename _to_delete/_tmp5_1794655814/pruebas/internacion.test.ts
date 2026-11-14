// Internación (etapa 5): ingreso, evolución diaria y alta con cobro de los días.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaAlta, esquemaEvolucion, esquemaIngreso } from '../src/compartido/esquemas';
import { diasDeInternacion, totalInternacion } from '../src/compartido/servicios';
import { agregarEvolucion, altasRecientes, cantidadInternadas, darAlta, evolucionesDe, ingresarMascota, listarInternadas, obtenerInternacion } from '../src/main/servicios/internacion';
import { reporte } from '../src/main/servicios/reportes';
import { baseNueva, mascota } from './ayudantes';

const dia = (d: number, h = 10) => new Date(2026, 10, 10 + d, h, 0);
const HOY = '2026-11-14';
let db: BaseDeDatos;
let luna: number;
let thor: number;

beforeEach(() => {
  db = baseNueva();
  luna = mascota(db, { nombre: 'Luna' });
  thor = mascota(db, { nombre: 'Thor', dueno: { dni: '30111222', nombre: 'Ana', apellido: 'Ruiz' } });
});

const ingresar = (mascotaId: number, extra = {}, ahora = dia(0)) =>
  ingresarMascota(db, esquemaIngreso.parse({ mascotaId, motivo: 'Gastroenteritis', lugar: 'Jaula 2', tarifaDiariaCentavos: 1_500_000, ...extra }), null, ahora);

describe('cuentas de días', () => {
  it('el mismo día cuenta 1 día; después, los días que pasaron', () => {
    expect(diasDeInternacion('2026-11-10', '2026-11-10')).toBe(1);
    expect(diasDeInternacion('2026-11-10', '2026-11-11')).toBe(1);
    expect(diasDeInternacion('2026-11-10', '2026-11-14')).toBe(4);
    expect(totalInternacion(4, 1_500_000)).toBe(6_000_000);
  });
});

describe('ingresar', () => {
  it('queda internada y suma días y total hasta hoy', () => {
    const id = ingresar(luna);
    const i = obtenerInternacion(db, id, HOY);
    expect(i).toMatchObject({ mascota: 'Luna', lugar: 'Jaula 2', ingreso: '2026-11-10', dias: 4, totalCentavos: 6_000_000, egreso: null, ultimaEvolucion: null });
    expect(listarInternadas(db, HOY)).toHaveLength(1);
    expect(cantidadInternadas(db)).toBe(1);
  });
  it('una mascota no puede estar internada dos veces a la vez', () => {
    ingresar(luna);
    expect(() => ingresar(luna)).toThrow('Luna ya está internada (Jaula 2)');
    expect(ingresar(thor)).toBeGreaterThan(0);
  });
  it('el motivo es obligatorio y la tarifa no puede ser negativa', () => {
    expect(() => esquemaIngreso.parse({ mascotaId: luna, motivo: '  ' })).toThrow('Escribí el motivo de la internación');
    expect(() => esquemaIngreso.parse({ mascotaId: luna, motivo: 'x', tarifaDiariaCentavos: -1 })).toThrow('negativa');
  });
  it('no se interna una mascota dada de baja ni un veterinario inexistente', () => {
    db.$client.prepare('UPDATE mascotas SET activo = 0 WHERE id = ?').run(thor);
    expect(() => ingresar(thor)).toThrow('dada de baja');
    expect(() => ingresar(luna, { profesionalId: 999 })).toThrow('no está disponible');
    expect(() => ingresar(999)).toThrow('no existe');
  });
});

describe('evolución', () => {
  it('guarda las notas con temperatura opcional, la más nueva primero, y la última se ve en la lista', () => {
    const id = ingresar(luna);
    agregarEvolucion(db, esquemaEvolucion.parse({ internacionId: id, texto: 'Decaída, con suero', temperaturaC: 39.8 }), null, dia(0, 11));
    agregarEvolucion(db, esquemaEvolucion.parse({ internacionId: id, texto: 'Come sola' }), null, dia(1, 9));
    const ev = evolucionesDe(db, id);
    expect(ev.map((e) => e.texto)).toEqual(['Come sola', 'Decaída, con suero']);
    expect(ev[1]!.temperaturaC).toBe(39.8);
    expect(ev[0]!.temperaturaC).toBeNull();
    expect(listarInternadas(db, HOY)[0]!.ultimaEvolucion).toMatchObject({ texto: 'Come sola' });
  });
  it('valida la temperatura y que haya texto', () => {
    expect(() => esquemaEvolucion.parse({ internacionId: 1, texto: 'x', temperaturaC: 50 })).toThrow('entre 30 y 45');
    expect(() => esquemaEvolucion.parse({ internacionId: 1, texto: '' })).toThrow('Escribí');
  });
  it('después del alta ya no se agregan notas', () => {
    const id = ingresar(luna);
    darAlta(db, esquemaAlta.parse({ internacionId: id, metodo: 'efectivo' }), dia(2));
    expect(() => agregarEvolucion(db, esquemaEvolucion.parse({ internacionId: id, texto: 'tarde' }), null, dia(3))).toThrow('ya fue dada de alta');
  });
});

describe('alta', () => {
  it('cobra los días, queda en altas recientes y la mascota puede volver a internarse', () => {
    const id = ingresar(luna);
    const cobrado = darAlta(db, esquemaAlta.parse({ internacionId: id, metodo: 'transferencia' }), dia(3));
    expect(cobrado).toBe(4_500_000);
    expect(listarInternadas(db, HOY)).toHaveLength(0);
    expect(altasRecientes(db)[0]).toMatchObject({ mascota: 'Luna', egreso: '2026-11-13', dias: 3, totalCentavos: 4_500_000, metodo: 'transferencia' });
    expect(ingresar(luna, {}, dia(4))).toBeGreaterThan(id);
    expect(() => darAlta(db, esquemaAlta.parse({ internacionId: id, metodo: 'efectivo' }), dia(5))).toThrow('ya fue dada de alta');
  });
  it('si hay algo para cobrar, el medio de pago es obligatorio', () => {
    const id = ingresar(luna);
    expect(() => darAlta(db, esquemaAlta.parse({ internacionId: id }), dia(1))).toThrow('Elegí cómo paga');
    expect(obtenerInternacion(db, id, HOY).egreso).toBeNull();
  });
  it('sin tarifa no se pide medio de pago', () => {
    const id = ingresar(luna, { tarifaDiariaCentavos: 0 });
    expect(darAlta(db, esquemaAlta.parse({ internacionId: id }), dia(1))).toBe(0);
    expect(obtenerInternacion(db, id, HOY).metodo).toBeNull();
  });
  it('el reporte suma las altas del período con sus días y lo cobrado', () => {
    darAlta(db, esquemaAlta.parse({ internacionId: ingresar(luna), metodo: 'efectivo' }), dia(2));
    darAlta(db, esquemaAlta.parse({ internacionId: ingresar(thor, {}, dia(1)), metodo: 'efectivo' }), dia(1, 18));
    const r = reporte(db, { desde: '2026-11-01', hasta: '2026-11-30' }).servicios.internacion;
    expect(r).toEqual({ altas: 2, dias: 3, cobradoCentavos: 3_000_000 + 1_500_000 });
  });
});
