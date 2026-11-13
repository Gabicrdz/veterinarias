import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaBuscarDuenos, esquemaBuscarMascotas, esquemaMascota } from '../src/compartido/esquemas';
import { buscarDuenos, buscarMascotas, cambiarActivoMascota } from '../src/main/servicios/mascotas';
import { baseNueva, mascota } from './ayudantes';

let db: BaseDeDatos;
const buscar = (texto = '', extra: object = {}) => buscarMascotas(db, esquemaBuscarMascotas.parse({ texto, ...extra }));

beforeEach(() => {
  db = baseNueva();
});

describe('mascotas', () => {
  it('valida los datos de la mascota y del dueño; DNI y microchip se guardan solo con números', () => {
    const dueno = { nombre: 'Juan', apellido: 'Paz' };
    expect(() => esquemaMascota.parse({ nombre: 'Rex', dueno: { ...dueno, dni: '123' } })).toThrow('7 u 8 números');
    expect(() => esquemaMascota.parse({ nombre: 'Rex', dueno: { ...dueno, email: 'juan@' } })).toThrow('email');
    expect(() => esquemaMascota.parse({ nombre: 'Rex', fechaNacimiento: '2020-02-31', dueno })).toThrow('no existe');
    expect(() => esquemaMascota.parse({ nombre: 'Rex', microchip: '123', dueno })).toThrow('entre 9 y 15');
    expect(() => esquemaMascota.parse({ nombre: 'Rex', especie: 'dragon', dueno })).toThrow();
    expect(() => esquemaMascota.parse({ nombre: ' ', dueno })).toThrow('Escribí el nombre de la mascota');
    expect(() => esquemaMascota.parse({ nombre: 'Rex', dueno: { nombre: 'Juan', apellido: ' ' } })).toThrow('Escribí el apellido del dueño');
    mascota(db, { nombre: 'Rex', microchip: '985 112 003 456 789', dueno: { ...dueno, dni: '30.123.456' } });
    expect(buscar()[0]).toMatchObject({ nombre: 'Rex', especie: 'perro', sexo: null, castrado: false, microchip: '985112003456789', dueno: { dni: '30123456' } });
  });

  it('el DNI del dueño y el microchip no se repiten, pero pueden faltar', () => {
    mascota(db, { nombre: 'Rex', microchip: '985112003456789', dueno: { nombre: 'Juan', apellido: 'Paz', dni: '30123456' } });
    expect(() => mascota(db, { nombre: 'Otro', dueno: { nombre: 'Pedro', apellido: 'Ruiz', dni: '30 123 456' } })).toThrow('Ese DNI ya es de Paz, Juan');
    expect(() => mascota(db, { nombre: 'Otro', microchip: '985112003456789', dueno: { nombre: 'Pedro', apellido: 'Ruiz' } })).toThrow('Ese microchip ya es de Rex');
    mascota(db, { nombre: 'Sin1', dueno: { nombre: 'A', apellido: 'Uno' } });
    mascota(db, { nombre: 'Sin2', dueno: { nombre: 'B', apellido: 'Dos' } });
    expect(buscar()).toHaveLength(3);
  });

  it('no acepta fecha de nacimiento futura', () => {
    expect(() => mascota(db, { nombre: 'Rex', fechaNacimiento: '2999-01-01' })).toThrow('no puede ser futura');
  });

  it('un dueño puede tener varias mascotas: se actualiza una sola vez', () => {
    const rex = mascota(db, { nombre: 'Rex', dueno: { nombre: 'Juan', apellido: 'Paz', telefono: '370 455-1020' } });
    const dueno = buscar('rex')[0]!.dueno;
    const luna = mascota(db, { nombre: 'Luna', especie: 'gato', dueno: { id: dueno.id, nombre: 'Juan', apellido: 'Paz', telefono: '370 411-0000' } });
    expect(db.$client.prepare('SELECT count(*) AS n FROM duenos').get()).toEqual({ n: 1 });
    // Cambiar el teléfono desde una mascota lo cambia para las dos (es la misma persona)
    expect(buscar().map((m) => [m.nombre, m.dueno.telefono])).toEqual([['Luna', '370 411-0000'], ['Rex', '370 411-0000']]);
    expect(buscar().map((m) => m.id).sort()).toEqual([rex, luna].sort());
    // Si algo falla (microchip repetido) no se guarda ni el dueño
    mascota(db, { nombre: 'Chip', microchip: '985112003456789', dueno: { id: dueno.id, nombre: 'Juan', apellido: 'Paz' } });
    expect(() => mascota(db, { nombre: 'Otro', microchip: '985112003456789', dueno: { nombre: 'Nuevo', apellido: 'Dueño' } })).toThrow('microchip');
    expect(db.$client.prepare('SELECT count(*) AS n FROM duenos').get()).toEqual({ n: 1 });
  });

  it('busca por la mascota o por el dueño, sin tildes, con varias palabras', () => {
    mascota(db, { nombre: 'Rex', raza: 'Ovejero alemán', dueno: { nombre: 'José', apellido: 'Pérez', dni: '20345671', telefono: '370 455-1020' } });
    mascota(db, { nombre: 'Luna', especie: 'gato', dueno: { nombre: 'María José', apellido: 'Gómez', dni: '30123456' } });
    mascota(db, { nombre: 'Toby', dueno: { nombre: 'Ana', apellido: 'López' } });
    expect(buscar('jose').map((m) => m.nombre)).toEqual(['Luna', 'Rex']); // por el nombre del dueño, ordenadas por mascota
    expect(buscar('rex perez').map((m) => m.nombre)).toEqual(['Rex']); // mascota + dueño
    expect(buscar('ovejero').map((m) => m.nombre)).toEqual(['Rex']); // por raza
    expect(buscar('gato').map((m) => m.nombre)).toEqual(['Luna']); // por especie
    expect(buscar('30.123.456').map((m) => m.nombre)).toEqual(['Luna']);
    expect(buscar('4551020').map((m) => m.nombre)).toEqual(['Rex']);
    expect(buscar('%')).toEqual([]); // los comodines de LIKE se buscan como texto
    expect(buscar('_')).toEqual([]);
  });

  it('filtra por especie; la baja la esconde', () => {
    const rex = mascota(db, { nombre: 'Rex', especie: 'perro' });
    mascota(db, { nombre: 'Luna', especie: 'gato' });
    expect(buscar('', { especie: 'gato' }).map((m) => m.nombre)).toEqual(['Luna']);
    cambiarActivoMascota(db, rex, false);
    expect(buscar().map((m) => m.nombre)).toEqual(['Luna']);
    expect(buscar('', { incluirBajas: true }).map((m) => [m.nombre, m.activo])).toEqual([['Luna', true], ['Rex', false]]);
  });

  it('editar actualiza la búsqueda', () => {
    const id = mascota(db, { nombre: 'Rex', dueno: { nombre: 'Juan', apellido: 'Paz' } });
    mascota(db, { id, nombre: 'Max', dueno: { id: buscar()[0]!.dueno.id, nombre: 'Juan', apellido: 'Benítez' } });
    expect(buscar('rex')).toEqual([]);
    expect(buscar('paz')).toEqual([]);
    expect(buscar('max benitez')).toHaveLength(1);
  });

  it('busca dueños ya cargados (para sumarles otra mascota)', () => {
    mascota(db, { nombre: 'Rex', dueno: { nombre: 'Juan', apellido: 'Paz', dni: '30123456' } });
    mascota(db, { nombre: 'Luna', dueno: { nombre: 'Ana', apellido: 'Ruiz' } });
    expect(buscarDuenos(db, esquemaBuscarDuenos.parse({ texto: 'paz' })).map((d) => d.nombre)).toEqual(['Juan']);
    expect(buscarDuenos(db, esquemaBuscarDuenos.parse({ texto: '30.123' }))).toHaveLength(1);
    expect(buscarDuenos(db, esquemaBuscarDuenos.parse({ texto: '' }))).toHaveLength(2);
  });
});
