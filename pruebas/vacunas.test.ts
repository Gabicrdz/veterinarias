// Vacunas y desparasitaciones (etapa 3): carnet, dosis que tocan, aviso por WhatsApp y migración.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaAplicacion, esquemaPendientes, esquemaUsuario, type DatosAplicacion } from '../src/compartido/esquemas';
import { diasEntre, estadoDeDosis, sugeridasDe, sumarMeses } from '../src/compartido/vacunas';
import { armarMensajeVacuna } from '../src/compartido/whatsapp';
import { anularAplicacion, cantidadVencidas, carnetDeMascota, dosisPendientes, enlaceAviso, marcarAvisado, registrarAplicacion } from '../src/main/servicios/vacunas';
import { guardarMensajeVacuna, obtenerVeterinaria } from '../src/main/servicios/veterinaria';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { cargarEjemplo, cargarVacunasEjemploSueltas } from '../src/main/servicios/ejemplo';
import { baseNueva, mascota } from './ayudantes';

// Lunes 16/11/2026 a las 09:00
const AHORA = new Date(2026, 10, 16, 9, 0);
const HOY = '2026-11-16';

let db: BaseDeDatos;
let rex: number;
let YO: { id: number; profesionalId: null };

beforeEach(() => {
  db = baseNueva();
  YO = { id: guardarUsuario(db, esquemaUsuario.parse({ nombre: 'Ana', rol: 'recepcion', pin: '1111' })), profesionalId: null };
  rex = mascota(db, { nombre: 'Rex', fechaNacimiento: '2024-03-10', dueno: { nombre: 'Juan', apellido: 'Pérez', telefono: '370 455-1020' } });
});

const aplicar = (datos: Partial<DatosAplicacion> = {}, ahora = AHORA) =>
  registrarAplicacion(db, esquemaAplicacion.parse({ mascotaId: rex, tipo: 'vacuna', nombre: 'Antirrábica', fecha: '2026-11-10', proximaDosis: '2027-11-10', ...datos }), YO, ahora);
const pendientes = (dentroDeDias = 30) => dosisPendientes(db, esquemaPendientes.parse({ dentroDeDias }), AHORA);

describe('fechas de las dosis (funciones puras)', () => {
  it('suma meses sin pasarse de mes', () => {
    expect(sumarMeses('2026-11-10', 12)).toBe('2027-11-10');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28'); // no 03/03
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29'); // bisiesto
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(sumarMeses('2026-03-15', -12)).toBe('2025-03-15');
    expect(sumarMeses('2026-12-20', 1)).toBe('2027-01-20');
  });

  it('cuenta días y clasifica: vencida, esta semana, próxima', () => {
    expect(diasEntre('2026-11-16', '2026-11-20')).toBe(4);
    expect(diasEntre('2026-11-16', '2026-11-10')).toBe(-6);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
    expect(estadoDeDosis('2026-11-15', HOY)).toBe('vencida');
    expect(estadoDeDosis('2026-11-16', HOY)).toBe('esta_semana'); // hoy no está vencida
    expect(estadoDeDosis('2026-11-23', HOY)).toBe('esta_semana');
    expect(estadoDeDosis('2026-11-24', HOY)).toBe('proxima');
  });

  it('ofrece sugerencias según la especie (y una lista general para las demás)', () => {
    expect(sugeridasDe('perro').map((s) => s.nombre)).toContain('Quíntuple / Séxtuple');
    expect(sugeridasDe('gato').map((s) => s.nombre)).toContain('Triple felina');
    expect(sugeridasDe('ave').map((s) => s.nombre)).toContain('Antirrábica');
  });
});

describe('registrar y anular', () => {
  it('valida el formulario', () => {
    const base = { mascotaId: 1, tipo: 'vacuna', nombre: 'Antirrábica', fecha: '2026-11-10' };
    expect(esquemaAplicacion.parse(base)).toMatchObject({ proximaDosis: null, lote: '', notas: '' });
    expect(() => esquemaAplicacion.parse({ ...base, nombre: ' ' })).toThrow('Escribí qué se aplicó');
    expect(() => esquemaAplicacion.parse({ ...base, tipo: 'otra' })).toThrow('vacuna o desparasitación');
    expect(() => esquemaAplicacion.parse({ ...base, fecha: '2026-02-31' })).toThrow('no existe');
    expect(() => esquemaAplicacion.parse({ ...base, proximaDosis: '2026-11-10' })).toThrow('después de la fecha');
    expect(() => esquemaAplicacion.parse({ ...base, proximaDosis: '2026-11-01' })).toThrow('después de la fecha');
  });

  it('guarda en el carnet, de la más nueva a la más vieja', () => {
    aplicar({ nombre: 'Antirrábica', fecha: '2026-05-10', proximaDosis: '2027-05-10' });
    aplicar({ nombre: 'Triple', fecha: '2026-11-10', proximaDosis: null, lote: 'A123' });
    expect(carnetDeMascota(db, rex).map((a) => [a.nombre, a.fecha, a.lote, a.registradoPor])).toEqual([['Triple', '2026-11-10', 'A123', 'Ana'], ['Antirrábica', '2026-05-10', '', 'Ana']]);
  });

  it('no acepta fechas futuras, anteriores al nacimiento, repetidas ni mascotas de baja', () => {
    expect(() => aplicar({ fecha: '2026-11-17', proximaDosis: null })).toThrow('no puede ser futura');
    expect(() => aplicar({ fecha: '2024-03-09' })).toThrow('nació el 10/03/2024');
    aplicar();
    expect(() => aplicar({ nombre: ' antirrabica ' })).toThrow('ya está cargada el 10/11/2026'); // misma vacuna, mismo día
    db.$client.prepare('UPDATE mascotas SET activo = 0').run();
    expect(() => aplicar({ nombre: 'Otra' })).toThrow('dado de baja');
    expect(() => registrarAplicacion(db, esquemaAplicacion.parse({ mascotaId: 999, tipo: 'vacuna', nombre: 'X', fecha: HOY }), YO, AHORA)).toThrow('no existe');
  });

  it('anular saca la aplicación del carnet pero deja la fila (rastro)', () => {
    const id = aplicar();
    anularAplicacion(db, id, AHORA);
    expect(carnetDeMascota(db, rex)).toEqual([]);
    expect(db.$client.prepare('SELECT anulado, anulado_en FROM aplicaciones').get()).toEqual({ anulado: 1, anulado_en: '2026-11-16 09:00:00' });
    expect(() => anularAplicacion(db, id)).toThrow('ya estaba anulada');
    expect(() => anularAplicacion(db, 999)).toThrow('no existe');
    aplicar(); // anulada una carga equivocada, se puede volver a cargar el mismo día
  });

  it('la base rechaza una próxima dosis anterior a la aplicación (segunda defensa)', () => {
    expect(() => db.$client.prepare(`INSERT INTO aplicaciones (mascota_id, tipo, nombre, fecha, proxima_dosis) VALUES (?, 'vacuna', 'X', '2026-11-10', '2026-11-01')`).run(rex)).toThrow();
  });
});

describe('dosis que tocan', () => {
  it('lista las vencidas y las de los próximos 30 días, de la más urgente a la menos', () => {
    aplicar({ nombre: 'Vencida', fecha: '2025-11-01', proximaDosis: '2026-11-01' });
    aplicar({ nombre: 'Hoy', fecha: '2025-11-16', proximaDosis: HOY });
    aplicar({ nombre: 'En 30', fecha: '2025-12-16', proximaDosis: '2026-12-16' });
    aplicar({ nombre: 'En 31', fecha: '2025-12-17', proximaDosis: '2026-12-17' });
    expect(pendientes().map((d) => [d.nombre, d.dias, d.estado])).toEqual([
      ['Vencida', -15, 'vencida'],
      ['Hoy', 0, 'esta_semana'],
      ['En 30', 30, 'proxima'],
    ]);
    expect(pendientes(0).map((d) => d.nombre)).toEqual(['Vencida', 'Hoy']);
    expect(pendientes(365)).toHaveLength(4);
  });

  it('al aplicar la siguiente, la dosis anterior deja de tocar (sin marcar nada a mano)', () => {
    aplicar({ fecha: '2025-11-01', proximaDosis: '2026-11-01' });
    expect(pendientes()).toHaveLength(1);
    aplicar({ fecha: '2026-11-10', proximaDosis: '2027-11-10' });
    expect(pendientes()).toEqual([]);
    expect(pendientes(365).map((d) => d.proximaDosis)).toEqual(['2027-11-10']);
    expect(carnetDeMascota(db, rex).map((a) => [a.fecha, a.renovada])).toEqual([['2026-11-10', false], ['2025-11-01', true]]);
    // Si se anula la nueva, la anterior vuelve a tocar
    anularAplicacion(db, carnetDeMascota(db, rex)[0]!.id, AHORA);
    expect(pendientes().map((d) => d.proximaDosis)).toEqual(['2026-11-01']);
  });

  it('una vacuna no renueva a otra distinta, y cada mascota va por su lado', () => {
    const luna = mascota(db, { nombre: 'Luna', especie: 'gato', dueno: { nombre: 'Ana', apellido: 'Ruiz', telefono: '' } });
    aplicar({ nombre: 'Antirrábica', fecha: '2025-11-01', proximaDosis: '2026-11-01' });
    aplicar({ nombre: 'Triple', fecha: '2026-11-10', proximaDosis: '2027-11-10' });
    aplicar({ mascotaId: luna, nombre: 'Antirrábica', fecha: '2026-11-10', proximaDosis: '2027-11-10' });
    expect(pendientes().map((d) => [d.mascota, d.nombre])).toEqual([['Rex', 'Antirrábica']]);
  });

  it('trae los datos para avisar y esconde a las mascotas dadas de baja', () => {
    aplicar({ fecha: '2025-11-01', proximaDosis: '2026-11-20' });
    expect(pendientes()[0]).toMatchObject({ mascota: 'Rex', especie: 'perro', dueno: 'Pérez, Juan', telefono: '370 455-1020', tieneWhatsApp: true, tipo: 'vacuna', aplicadaEl: '2025-11-01', avisadoEn: null });
    db.$client.prepare('UPDATE mascotas SET activo = 0').run();
    expect(pendientes()).toEqual([]);
  });

  it('cuenta las vencidas para el número del menú', () => {
    aplicar({ nombre: 'A', fecha: '2025-11-01', proximaDosis: '2026-11-01' });
    aplicar({ nombre: 'B', fecha: '2025-11-02', proximaDosis: '2026-11-15' });
    aplicar({ nombre: 'C', fecha: '2025-11-16', proximaDosis: HOY });
    expect(cantidadVencidas(db, AHORA)).toBe(2);
  });
});

describe('aviso por WhatsApp', () => {
  it('arma el enlace con el mensaje, el número internacional y los datos de la dosis', () => {
    const id = aplicar({ fecha: '2025-11-20', proximaDosis: '2026-11-20' });
    const enlace = enlaceAviso(db, id);
    expect(enlace.startsWith('https://wa.me/5493704551020?text=')).toBe(true);
    const texto = decodeURIComponent(enlace.split('?text=')[1]!);
    expect(texto).toContain('Hola Juan!');
    expect(texto).toContain('Rex');
    expect(texto).toContain('Antirrábica');
    expect(texto).toContain('20/11/2026');
    expect(texto).toContain(obtenerVeterinaria(db).nombreVeterinaria);
  });

  it('usa el mensaje editado en Ajustes', () => {
    const id = aplicar({ fecha: '2025-11-20', proximaDosis: '2026-11-20' });
    guardarMensajeVacuna(db, '{mascota}: {vacuna} el {fecha}. {inventada}');
    expect(decodeURIComponent(enlaceAviso(db, id).split('?text=')[1]!)).toBe('Rex: Antirrábica el 20/11/2026. {inventada}');
    expect(armarMensajeVacuna('{constructor}', { nombre: '', apellido: '', mascota: '', vacuna: '', fecha: '', veterinaria: '', direccion: '' })).toBe('{constructor}');
  });

  it('marcar como avisado se ve en la lista; la nueva aplicación empieza sin aviso', () => {
    const id = aplicar({ fecha: '2025-11-20', proximaDosis: '2026-11-20' });
    marcarAvisado(db, id, AHORA);
    expect(pendientes()[0]!.avisadoEn).toBe('2026-11-16 09:00:00');
    expect(carnetDeMascota(db, rex)[0]!.avisadoEn).toBe('2026-11-16 09:00:00');
  });

  it('avisa con claridad cuando no se puede', () => {
    const id = aplicar({ fecha: '2025-11-20', proximaDosis: '2026-11-20' });
    db.$client.prepare(`UPDATE duenos SET telefono = ''`).run();
    expect(() => enlaceAviso(db, id)).toThrow('no tiene teléfono cargado');
    db.$client.prepare(`UPDATE duenos SET telefono = '455-1020'`).run();
    expect(() => enlaceAviso(db, id)).toThrow('no parece un celular con código de área');
    db.$client.prepare(`UPDATE duenos SET telefono = '370 455-1020'`).run();
    const sinProxima = aplicar({ nombre: 'Única', proximaDosis: null });
    expect(() => enlaceAviso(db, sinProxima)).toThrow('no tiene próxima dosis');
    aplicar({ fecha: '2026-11-10', proximaDosis: '2027-11-10' }); // renueva la anterior
    expect(() => enlaceAviso(db, id)).toThrow('ya recibió una Antirrábica más nueva');
    anularAplicacion(db, id, AHORA);
    expect(() => enlaceAviso(db, id)).toThrow('no existe');
    expect(() => enlaceAviso(db, 999)).toThrow('no existe');
  });
});

describe('datos de ejemplo', () => {
  it('traen carnets con dosis vencidas, de esta semana y próximas, y ninguna renovada en la lista', () => {
    const otra = baseNueva();
    cargarEjemplo(otra, AHORA);
    const lista = dosisPendientes(otra, { dentroDeDias: 365 }, AHORA);
    expect(lista.filter((d) => d.estado === 'vencida').length).toBeGreaterThan(2);
    expect(lista.filter((d) => d.estado === 'esta_semana').length).toBeGreaterThan(1);
    expect(lista.filter((d) => d.estado === 'proxima').length).toBeGreaterThan(2);
    expect(lista.some((d) => d.avisadoEn !== null)).toBe(true);
    // Ninguna mascota tiene dos pendientes de lo mismo: lo viejo siempre queda renovado
    const claves = lista.map((d) => `${d.mascotaId}|${d.nombre}`);
    expect(new Set(claves).size).toBe(claves.length);
    // Solo perros y gatos llevan carnet
    expect(lista.every((d) => d.especie === 'perro' || d.especie === 'gato')).toBe(true);
  });
});

describe('vacunas de ejemplo sueltas (el ejemplo ya estaba cargado)', () => {
  it('cargan carnets si hay mascotas sin vacunas, y no se pisan si ya hay', () => {
    const otra = baseNueva();
    cargarEjemplo(otra, AHORA);
    otra.$client.prepare('DELETE FROM aplicaciones').run(); // como una base cargada antes de las vacunas
    expect(dosisPendientes(otra, { dentroDeDias: 365 }, AHORA)).toEqual([]);
    const n = cargarVacunasEjemploSueltas(otra, AHORA);
    expect(n).toBeGreaterThan(30);
    expect(dosisPendientes(otra, { dentroDeDias: 30 }, AHORA).length).toBeGreaterThan(10);
    expect(() => cargarVacunasEjemploSueltas(otra, AHORA)).toThrow('Ya hay vacunas cargadas');
  });

  it('pide mascotas primero', () => {
    expect(() => cargarVacunasEjemploSueltas(baseNueva(), AHORA)).toThrow('Primero cargá mascotas');
  });
});
