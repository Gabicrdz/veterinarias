// Peso y temperatura en la consulta (etapa 2): validación, guardado en enteros y migración.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaConsulta, esquemaTurno, esquemaUsuario, type DatosConsulta } from '../src/compartido/esquemas';
import { darTurno } from '../src/main/servicios/turnos';
import { guardarConsulta, historiaClinica } from '../src/main/servicios/consultas';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { cargarEjemplo } from '../src/main/servicios/ejemplo';
import { baseNueva, mascota, profesional } from './ayudantes';

const AHORA = new Date(2026, 10, 16, 9, 0);
const lunesAViernes = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, desde: '08:00', hasta: '12:00' }));

let db: BaseDeDatos;
let laura: number;
let rex: number;
let usuario: number;

beforeEach(() => {
  db = baseNueva();
  laura = profesional(db, { horarios: lunesAViernes });
  rex = mascota(db, { nombre: 'Rex' });
  usuario = guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Laura', rol: 'profesional', profesionalId: laura, pin: '2222' }));
});

const turno = (fecha: string, desde: string) =>
  darTurno(db, esquemaTurno.parse({ profesionalId: laura, mascotaId: rex, fecha, desde, motivo: 'Control' }), new Date(2026, 10, 10, 7));
const consulta = (datos: Partial<DatosConsulta> & { turnoId: number }, ahora = AHORA) =>
  guardarConsulta(db, esquemaConsulta.parse({ evolucion: 'Bien.', ...datos }), { id: usuario, profesionalId: laura }, ahora);

describe('peso y temperatura', () => {
  it('son opcionales y se validan los rangos', () => {
    const base = { turnoId: 1, evolucion: 'Bien.' };
    expect(esquemaConsulta.parse(base)).toMatchObject({ pesoKg: null, temperaturaC: null });
    expect(() => esquemaConsulta.parse({ ...base, pesoKg: 0 })).toThrow('peso mínimo');
    expect(() => esquemaConsulta.parse({ ...base, pesoKg: 151 })).toThrow('peso máximo');
    expect(() => esquemaConsulta.parse({ ...base, pesoKg: Number.NaN })).toThrow('peso no es válido');
    expect(() => esquemaConsulta.parse({ ...base, temperaturaC: 29.9 })).toThrow('entre 30 y 45');
    expect(() => esquemaConsulta.parse({ ...base, temperaturaC: 46 })).toThrow('entre 30 y 45');
    expect(() => esquemaConsulta.parse({ ...base, temperaturaC: Number.NaN })).toThrow('temperatura no es válida');
    expect(esquemaConsulta.parse({ ...base, pesoKg: 0.05, temperaturaC: 45 })).toMatchObject({ pesoKg: 0.05, temperaturaC: 45 });
  });

  it('se guardan como enteros (gramos y décimas) y vuelven como kilos y grados sin errores de coma', () => {
    const t = turno('2026-11-16', '09:00');
    consulta({ turnoId: t, pesoKg: 12.3, temperaturaC: 38.6 });
    expect(db.$client.prepare('SELECT peso_gramos AS p, temperatura_decimas AS t FROM consultas').get()).toEqual({ p: 12300, t: 386 });
    expect(historiaClinica(db, rex, AHORA)[0]).toMatchObject({ pesoKg: 12.3, temperaturaC: 38.6 });
  });

  it('corregir el mismo día actualiza el peso; vaciar el campo lo deja sin dato', () => {
    const t = turno('2026-11-16', '09:00');
    consulta({ turnoId: t, pesoKg: 12.3, temperaturaC: 38.6 });
    consulta({ turnoId: t, pesoKg: 12.8 }, new Date(2026, 10, 16, 18));
    expect(historiaClinica(db, rex, AHORA)[0]).toMatchObject({ pesoKg: 12.8, temperaturaC: null });
  });

  it('la historia trae cada consulta con su peso, de la más nueva a la más vieja', () => {
    consulta({ turnoId: turno('2026-11-12', '09:00'), pesoKg: 11.5 }, new Date(2026, 10, 12, 9, 30));
    consulta({ turnoId: turno('2026-11-16', '09:00'), pesoKg: 12 });
    consulta({ turnoId: turno('2026-11-17', '09:00') }, new Date(2026, 10, 17, 9, 30)); // no se pesó
    expect(historiaClinica(db, rex, AHORA).map((c) => c.pesoKg)).toEqual([null, 12, 11.5]);
  });

  it('la base rechaza valores imposibles aunque se salteen el esquema (segunda defensa)', () => {
    const t = turno('2026-11-16', '09:00');
    consulta({ turnoId: t });
    expect(() => db.$client.prepare('UPDATE consultas SET peso_gramos = 0').run()).toThrow();
    expect(() => db.$client.prepare('UPDATE consultas SET temperatura_decimas = 500').run()).toThrow();
  });

  it('los datos de ejemplo traen peso y temperatura en las consultas', () => {
    const otra = baseNueva();
    cargarEjemplo(otra, AHORA);
    const { sin } = otra.$client.prepare('SELECT count(*) AS sin FROM consultas WHERE peso_gramos IS NULL OR temperatura_decimas IS NULL').get() as { sin: number };
    const { con } = otra.$client.prepare('SELECT count(*) AS con FROM consultas').get() as { con: number };
    expect(con).toBeGreaterThan(50);
    expect(sin).toBe(0);
  });
});
