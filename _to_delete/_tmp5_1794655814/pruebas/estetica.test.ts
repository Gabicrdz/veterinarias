// Baños y peluquería (etapa 5): el tablero, los pasos hasta entregar, el cobro y el aviso por WhatsApp.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaCambioEstetica, esquemaServicioEstetica } from '../src/compartido/esquemas';
import { cambiarEstadoServicio, crearServicio, enlaceListo, marcarAvisadoListo, tablero, ultimosPrecios } from '../src/main/servicios/estetica';
import { cargarEjemplo, cargarServiciosEjemplo } from '../src/main/servicios/ejemplo';
import { reporte } from '../src/main/servicios/reportes';
import { cantidadInternadas } from '../src/main/servicios/internacion';
import { baseNueva, mascota } from './ayudantes';

const AHORA = new Date(2026, 10, 14, 10, 0);
const HOY = '2026-11-14';
let db: BaseDeDatos;
let luna: number;

beforeEach(() => {
  db = baseNueva();
  luna = mascota(db, { nombre: 'Luna', dueno: { nombre: 'Juan', apellido: 'Pérez', telefono: '370 455-1020' } });
});

const nuevo = (extra = {}, mascotaId = luna) =>
  crearServicio(db, esquemaServicioEstetica.parse({ mascotaId, fecha: HOY, tipo: 'bano', precioCentavos: 1_200_000, ...extra }), null, AHORA);
const pasar = (id: number, estado: string, metodo: string | null = null, ahora = AHORA) =>
  cambiarEstadoServicio(db, esquemaCambioEstetica.parse({ id, estado, metodo }), ahora);
const estadoDe = (id: number) => tablero(db, HOY).activos.find((s) => s.id === id)?.estado;

describe('tablero', () => {
  it('lo de hoy y lo atrasado va en activos; lo futuro en próximos', () => {
    const hoy = nuevo();
    const manana = nuevo({ fecha: '2026-11-15' });
    const t = tablero(db, HOY);
    expect(t.activos.map((s) => s.id)).toEqual([hoy]);
    expect(t.proximos.map((s) => s.id)).toEqual([manana]);
    expect(t.activos[0]).toMatchObject({ mascota: 'Luna', tipo: 'bano', estado: 'esperando', precioCentavos: 1_200_000, avisado: false });
  });
  it('los listos van primero, después los que están en proceso', () => {
    const a = nuevo();
    const b = nuevo();
    const c = nuevo();
    pasar(b, 'en_proceso');
    pasar(c, 'en_proceso');
    pasar(c, 'listo');
    expect(tablero(db, HOY).activos.map((s) => s.id)).toEqual([c, b, a]);
  });
  it('no se pide un servicio con fecha anterior a hoy ni de una mascota dada de baja', () => {
    expect(() => nuevo({ fecha: '2026-11-13' })).toThrow('anterior a hoy');
    db.$client.prepare('UPDATE mascotas SET activo = 0 WHERE id = ?').run(luna);
    expect(() => nuevo()).toThrow('dada de baja');
  });
});

describe('pasos y cobro', () => {
  it('avanza de a un paso y no se puede saltear', () => {
    const id = nuevo();
    expect(() => pasar(id, 'listo')).toThrow('no puede pasar');
    expect(() => pasar(id, 'entregado', 'efectivo')).toThrow('no puede pasar');
    pasar(id, 'en_proceso');
    pasar(id, 'listo');
    expect(estadoDe(id)).toBe('listo');
  });
  it('al entregar se cobra: sin medio de pago no entrega, y cuenta en lo cobrado de hoy', () => {
    const id = nuevo({ precioCentavos: 1_800_000, tipo: 'bano_corte' });
    pasar(id, 'en_proceso');
    pasar(id, 'listo');
    expect(() => pasar(id, 'entregado')).toThrow('Elegí cómo paga');
    expect(estadoDe(id)).toBe('listo');
    pasar(id, 'entregado', 'transferencia');
    const t = tablero(db, HOY);
    expect(t.activos).toHaveLength(0);
    expect(t.entregadosHoy[0]).toMatchObject({ id, metodo: 'transferencia' });
    expect(t.cobradoHoyCentavos).toBe(1_800_000);
    expect(() => pasar(id, 'cancelado')).toThrow('ya terminó');
  });
  it('un servicio sin cargo se entrega sin medio de pago', () => {
    const id = nuevo({ precioCentavos: 0 });
    pasar(id, 'en_proceso');
    pasar(id, 'listo');
    pasar(id, 'entregado');
    expect(tablero(db, HOY).entregadosHoy[0]!.metodo).toBeNull();
  });
  it('cancelar lo saca del tablero', () => {
    const id = nuevo();
    pasar(id, 'cancelado');
    expect(tablero(db, HOY).activos).toHaveLength(0);
    expect(() => pasar(id, 'en_proceso')).toThrow('no puede pasar');
  });
  it('propone el último precio de cada servicio', () => {
    nuevo({ tipo: 'unas', precioCentavos: 400_000 });
    nuevo({ tipo: 'unas', precioCentavos: 450_000 });
    const cancelado = nuevo({ tipo: 'corte', precioCentavos: 999_000 });
    pasar(cancelado, 'cancelado');
    expect(ultimosPrecios(db)).toEqual({ unas: 450_000 });
  });
});

describe('aviso por WhatsApp', () => {
  it('solo se avisa cuando está lista, con el mensaje armado', () => {
    const id = nuevo({ tipo: 'bano_corte' });
    expect(() => enlaceListo(db, id)).toThrow('Solo se avisa cuando');
    pasar(id, 'en_proceso');
    pasar(id, 'listo');
    const enlace = enlaceListo(db, id);
    expect(enlace.startsWith('https://wa.me/')).toBe(true);
    const texto = decodeURIComponent(enlace.split('?text=')[1]!);
    expect(texto).toContain('Luna ya está lista (Baño y corte)');
    expect(texto.includes('{')).toBe(false);
    marcarAvisadoListo(db, id, AHORA);
    expect(tablero(db, HOY).activos[0]!.avisado).toBe(true);
  });
  it('sin teléfono del dueño da un error claro', () => {
    const id = nuevo();
    pasar(id, 'en_proceso');
    pasar(id, 'listo');
    db.$client.prepare(`UPDATE duenos SET telefono = ''`).run();
    expect(() => enlaceListo(db, id)).toThrow('no tiene teléfono');
  });
});

describe('reporte y datos de ejemplo', () => {
  it('el reporte suma lo entregado por servicio', () => {
    for (const [tipo, precio] of [['bano', 1_200_000], ['bano', 1_200_000], ['unas', 400_000]] as const) {
      const id = nuevo({ tipo, precioCentavos: precio });
      pasar(id, 'en_proceso');
      pasar(id, 'listo');
      pasar(id, 'entregado', 'efectivo');
    }
    nuevo(); // sin entregar: no cuenta
    const e = reporte(db, { desde: HOY, hasta: HOY }).servicios.estetica;
    expect(e).toEqual({
      entregados: 3,
      cobradoCentavos: 2_800_000,
      porTipo: [{ tipo: 'bano', cantidad: 2, centavos: 2_400_000 }, { tipo: 'unas', cantidad: 1, centavos: 400_000 }],
    });
  });
  it('el ejemplo trae internadas, altas y un tablero con todos los estados, siempre igual', () => {
    const base = baseNueva();
    cargarEjemplo(base, AHORA);
    expect(cantidadInternadas(base)).toBe(3);
    const t = tablero(base, HOY);
    const por = (e: string) => t.activos.filter((s) => s.estado === e).length;
    expect([por('esperando'), por('en_proceso'), por('listo')]).toEqual([2, 1, 2]);
    expect(t.entregadosHoy).toHaveLength(3);
    expect(t.proximos).toHaveLength(2);
    expect(t.activos.filter((s) => s.avisado)).toHaveLength(1);
    expect(() => cargarServiciosEjemplo(base, AHORA)).toThrow('Ya hay internaciones o baños');
  });
});
