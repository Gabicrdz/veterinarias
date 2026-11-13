// Reportes, exportación de atenciones y copias de seguridad.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { abrirBaseDeDatos, cerrarBaseDeDatos, VERSION_BASE } from '../src/main/db/conexion';
import { esquemaBloqueo, esquemaCobro, esquemaPeriodo, esquemaTurno, type DatosCobro } from '../src/compartido/esquemas';
import { crearBloqueo } from '../src/main/servicios/bloqueos';
import { cambiarEstado, darTurno } from '../src/main/servicios/turnos';
import { registrarCobro } from '../src/main/servicios/cobros';
import { atencionesDelPeriodo, csvDeAtenciones, diasDelPeriodo, reporte } from '../src/main/servicios/reportes';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import {
  COPIAS_AUTOMATICAS_A_GUARDAR,
  copiaAutomatica,
  copiasAutomaticas,
  descripcionDeCopia,
  hacerCopia,
  nombreDeCopia,
  reemplazarBase,
  revisarCopia,
} from '../src/main/servicios/copias';
import { baseNueva, mascota, profesional } from './ayudantes';

const ANTES = new Date(2026, 10, 15, 10); // domingo 15/11: se dan los turnos
const DESPUES = new Date(2026, 10, 20, 10); // viernes 20/11: ya pasaron
const SEMANA = esquemaPeriodo.parse({ desde: '2026-11-16', hasta: '2026-11-20' });

describe('reportes', () => {
  let db: BaseDeDatos;
  let juan: number;

  beforeEach(() => {
    db = baseNueva();
    const laura = profesional(db, { horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, desde: '08:00', hasta: '12:00' })) }); // 12 turnos por día
    juan = mascota(db, { nombre: 'Firulais', especie: 'perro', dueno: { apellido: 'Pérez', nombre: 'Juan' } });
    const ana = mascota(db, { nombre: 'Luna', especie: 'gato', dueno: { apellido: 'Gómez', nombre: 'Ana' } });
    const pedro = mascota(db, { nombre: 'Toby', especie: 'perro', dueno: { apellido: 'Ruiz', nombre: 'Pedro' } });
    const turno = (mascotaId: number, fecha: string, desde: string) =>
      darTurno(db, esquemaTurno.parse({ profesionalId: laura, mascotaId, fecha, desde }), ANTES);
    const cobrar = (turnoId: number, datos: Partial<DatosCobro>) =>
      registrarCobro(db, esquemaCobro.parse({ turnoId, montoCentavos: 1_800_000, metodo: 'efectivo', ...datos }), DESPUES);

    const t1 = turno(juan, '2026-11-16', '08:00');
    const t2 = turno(ana, '2026-11-16', '08:20');
    const t3 = turno(juan, '2026-11-17', '08:00');
    const t4 = turno(ana, '2026-11-17', '08:20');
    const t5 = turno(pedro, '2026-11-17', '08:40');
    const t6 = turno(ana, '2026-11-18', '08:00');
    for (const t of [t1, t3, t5]) cambiarEstado(db, t, 'atendido', DESPUES);
    for (const t of [t2, t4]) cambiarEstado(db, t, 'ausente', DESPUES);
    cambiarEstado(db, t6, 'cancelado', DESPUES);
    cobrar(t1, {});
    cobrar(t3, { montoCentavos: 1_500_000, metodo: 'transferencia' });
    crearBloqueo(db, esquemaBloqueo.parse({ profesionalId: null, desde: '2026-11-19', hasta: '2026-11-19', motivo: 'Feriado' }));
  });

  it('totales: ausentismo sin contar cancelados, ingresos de lo que pagan los dueños', () => {
    const r = reporte(db, SEMANA);
    expect(r.totales).toEqual({
      turnos: 5,
      atendidos: 3,
      ausentes: 2,
      cancelados: 1,
      ausentismo: 2 / 5,
      ingresosCentavos: 3_300_000,
      porMetodo: [
        { metodo: 'efectivo', centavos: 1_800_000, cantidad: 1 },
        { metodo: 'transferencia', centavos: 1_500_000, cantidad: 1 },
      ],
      atendidosSinCobrar: 1,
      mascotasAtendidos: 2,
      mascotasNuevos: 2,
    });
  });

  it('ocupación según el horario, sin el feriado; especies; días; los que más faltan', () => {
    const r = reporte(db, SEMANA);
    expect(r.porProfesional).toMatchObject([
      { nombre: 'Dra. Laura Benítez', turnos: 5, atendidos: 3, ausentes: 2, disponibles: 48, ocupacion: 5 / 48, ingresosCentavos: 3_300_000 },
    ]);
    expect(r.porEspecie).toEqual([{ especie: 'perro', atenciones: 3, montoCentavos: 3_300_000 }]);
    expect(r.porDia).toHaveLength(5);
    expect(r.porDia[0]).toEqual({ fecha: '2026-11-16', atendidos: 1, ausentes: 1, ingresosCentavos: 1_800_000 });
    expect(r.porDia[3]).toEqual({ fecha: '2026-11-19', atendidos: 0, ausentes: 0, ingresosCentavos: 0 });
    expect(r.faltadores).toMatchObject([{ mascota: 'Luna', dueno: 'Gómez, Ana', ausentes: 2, turnos: 2 }]);
    // Un período sin nada no se rompe
    expect(reporte(db, esquemaPeriodo.parse({ desde: '2026-01-01', hasta: '2026-01-31' })).totales.ausentismo).toBeNull();
    expect(() => esquemaPeriodo.parse({ desde: '2025-01-01', hasta: '2026-11-20' })).toThrow('hasta un año');
    expect(diasDelPeriodo('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('las atenciones salen en un CSV para Excel en español', () => {
    const filas = atencionesDelPeriodo(db, SEMANA);
    expect(filas).toMatchObject([
      { fecha: '2026-11-16', mascota: 'Firulais', especie: 'perro', dueno: 'Pérez, Juan', montoCentavos: 1_800_000, metodo: 'efectivo' },
      { fecha: '2026-11-17', mascota: 'Firulais', montoCentavos: 1_500_000, metodo: 'transferencia' },
      { fecha: '2026-11-17', mascota: 'Toby', montoCentavos: 0, metodo: '' }, // atendida y sin cobrar
    ]);
    const csv = csvDeAtenciones(filas);
    expect(csv.startsWith('\ufeffFecha;Mascota;Especie;')).toBe(true); // BOM: Excel lee bien las tildes
    expect(csv).toContain('16/11/2026;Firulais;perro;Pérez, Juan;Dra. Laura Benítez;18000,00;efectivo');
    expect(csvDeAtenciones([{ ...filas[0]!, mascota: 'Raro; "Nombre"' }])).toContain(';"Raro; ""Nombre""";');
  });
});

describe('copias de seguridad', () => {
  let carpeta: string;
  const ruta = (nombre: string) => path.join(carpeta, nombre);
  beforeEach(() => {
    carpeta = mkdtempSync(path.join(tmpdir(), 'turnos-copias-'));
  });
  afterEach(() => {
    cerrarBaseDeDatos();
    rmSync(carpeta, { recursive: true, force: true });
  });

  it('copia, revisa y restaura', async () => {
    expect(nombreDeCopia(new Date(2026, 10, 10, 9, 5))).toBe('veterinaria-2026-11-10-0905.db');
    cerrarBaseDeDatos();
    const db = abrirBaseDeDatos(ruta('turnos.db'));
    cargarEjemplo(db, new Date(2026, 10, 16, 10));
    const copia = await hacerCopia(db, ruta('copias/turnos-1.db'));
    const resumen = revisarCopia(copia.ruta);
    expect(resumen).toMatchObject({ version: VERSION_BASE, mascotas: 32 });
    expect(resumen.turnos).toBeGreaterThan(100);
    expect(/^32 mascotas y [\d.]+ turnos; última atención del 16\/11\/2026$/.test(descripcionDeCopia(resumen))).toBe(true);

    db.$client.exec('DELETE FROM cobros; DELETE FROM consultas; DELETE FROM turnos;');
    cerrarBaseDeDatos();
    reemplazarBase(copia.ruta, ruta('turnos.db'));
    const restaurada = abrirBaseDeDatos(ruta('turnos.db'));
    expect((restaurada.$client.prepare('SELECT count(*) AS n FROM turnos').get() as { n: number }).n).toBeGreaterThan(100);
  });

  it('rechaza archivos que no son de Turnos, de una versión más nueva, o la base misma', () => {
    expect(() => reemplazarBase(ruta('turnos.db'), ruta('turnos.db'))).toThrow('el archivo que la veterinaria está usando');
    writeFileSync(ruta('foto.db'), 'esto no es una base de datos');
    expect(() => revisarCopia(ruta('foto.db'))).toThrow('no es una copia de la veterinaria');
    const caja = new Database(ruta('caja.db'));
    caja.exec('CREATE TABLE pedidos (id INTEGER); CREATE TABLE configuracion (clave TEXT);');
    caja.pragma('user_version = 6');
    caja.close();
    expect(() => revisarCopia(ruta('caja.db'))).toThrow('no es una copia de la veterinaria');
    const futura = new Database(ruta('futura.db'));
    futura.exec('CREATE TABLE mascotas (id INTEGER, activo INTEGER); CREATE TABLE profesionales (id INTEGER); CREATE TABLE horarios (id INTEGER); CREATE TABLE configuracion (clave TEXT);');
    futura.pragma(`user_version = ${VERSION_BASE + 1}`);
    futura.close();
    expect(() => revisarCopia(ruta('futura.db'))).toThrow('versión más nueva');
  });

  it('copia automática: una por día y guarda solo las últimas 10', async () => {
    cerrarBaseDeDatos();
    const db = abrirBaseDeDatos(ruta('turnos.db'));
    const auto = ruta('automaticas');
    for (let dia = 1; dia <= 12; dia++) {
      const hecha = await copiaAutomatica(db, auto, new Date(2026, 10, dia, 9, 0));
      expect(hecha).not.toBeNull();
      utimesSync(hecha!.ruta, new Date(2026, 10, dia), new Date(2026, 10, dia));
    }
    expect(await copiaAutomatica(db, auto, new Date(2026, 10, 12, 18, 0))).toBeNull();
    const lista = copiasAutomaticas(auto);
    expect(lista).toHaveLength(COPIAS_AUTOMATICAS_A_GUARDAR);
    expect(lista[0]!.nombre).toBe('veterinaria-automatica-2026-11-12-0900.db');
    expect(existsSync(path.join(auto, 'veterinaria-automatica-2026-11-01-0900.db'))).toBe(false);
  });
});
