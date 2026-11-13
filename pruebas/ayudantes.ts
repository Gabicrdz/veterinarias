import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { esquemaMascota, esquemaProfesional, type DatosDueno, type DatosMascota, type DatosProfesional } from '../src/compartido/esquemas';
import { guardarMascota } from '../src/main/servicios/mascotas';
import { guardarProfesional } from '../src/main/servicios/profesionales';

/** Una base nueva y vacía, en memoria, para cada prueba. */
export function baseNueva(): BaseDeDatos {
  cerrarBaseDeDatos();
  return abrirBaseDeDatos(':memory:');
}

/**
 * Guarda una mascota (con su dueño) pasando por Zod, igual que cuando llega de
 * la ventana. Si no se indica el dueño, es "Pérez, Juan".
 */
export function mascota(db: BaseDeDatos, datos: Omit<DatosMascota, 'dueno'> & { dueno?: Partial<DatosDueno> }) {
  return guardarMascota(db, esquemaMascota.parse({ ...datos, dueno: { nombre: 'Juan', apellido: 'Pérez', ...datos.dueno } }));
}

export function profesional(db: BaseDeDatos, datos: Partial<DatosProfesional> = {}) {
  return guardarProfesional(
    db,
    esquemaProfesional.parse({ nombre: 'Laura', apellido: 'Benítez', titulo: 'Dra.', duracionTurnoMin: 20, horarios: [], ...datos }),
  );
}
