// PRELOAD: el único puente entre la ventana y el main. Expone `window.turnos`
// con funciones concretas; la ventana nunca tiene acceso a ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { CANALES, type ApiTurnos } from '@compartido/api';

const pedir = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiTurnos = {
  sesion: {
    actual: () => pedir(CANALES.sesionActual),
    iniciar: (usuarioId, pin) => pedir(CANALES.sesionIniciar, usuarioId, pin),
    cerrar: () => pedir(CANALES.sesionCerrar),
  },
  usuarios: {
    paraIngresar: () => pedir(CANALES.usuariosParaIngresar),
    crearPrimero: (nombre, pin) => pedir(CANALES.usuariosCrearPrimero, nombre, pin),
    listar: () => pedir(CANALES.usuariosListar),
    guardar: (datos) => pedir(CANALES.usuariosGuardar, datos),
    darDeBaja: (id) => pedir(CANALES.usuariosBaja, id),
  },
  mascotas: {
    buscar: (filtro) => pedir(CANALES.mascotasBuscar, filtro),
    buscarDuenos: (filtro) => pedir(CANALES.duenosBuscar, filtro),
    guardar: (datos) => pedir(CANALES.mascotasGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.mascotasActivo, id, activo),
  },
  profesionales: {
    listar: () => pedir(CANALES.profesionalesListar),
    guardar: (datos) => pedir(CANALES.profesionalesGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.profesionalesActivo, id, activo),
  },
  bloqueos: {
    proximos: () => pedir(CANALES.bloqueosProximos),
    crear: (datos) => pedir(CANALES.bloqueosCrear, datos),
    borrar: (id) => pedir(CANALES.bloqueosBorrar, id),
  },
  turnos: {
    agenda: (rango) => pedir(CANALES.turnosAgenda, rango),
    libres: (profesionalId, fecha) => pedir(CANALES.turnosLibres, profesionalId, fecha),
    proximosLibres: (profesionalId) => pedir(CANALES.turnosProximosLibres, profesionalId),
    dar: (datos) => pedir(CANALES.turnosDar, datos),
    mover: (datos) => pedir(CANALES.turnosMover, datos),
    cambiarEstado: (id, estado) => pedir(CANALES.turnosEstado, id, estado),
    deMascota: (mascotaId) => pedir(CANALES.turnosDeMascota, mascotaId),
    recordar: (id) => pedir(CANALES.turnosRecordar, id),
  },
  consultas: {
    historia: (mascotaId) => pedir(CANALES.consultasHistoria, mascotaId),
    guardar: (datos) => pedir(CANALES.consultasGuardar, datos),
  },
  cobros: {
    registrar: (datos) => pedir(CANALES.cobrosRegistrar, datos),
    anular: (id) => pedir(CANALES.cobrosAnular, id),
  },
  veterinaria: {
    obtener: () => pedir(CANALES.veterinariaObtener),
    guardar: (datos) => pedir(CANALES.veterinariaGuardar, datos),
    guardarMensaje: (mensaje) => pedir(CANALES.veterinariaMensaje, mensaje),
  },
  reportes: {
    obtener: (periodo) => pedir(CANALES.reportesObtener, periodo),
    exportarAtenciones: (periodo) => pedir(CANALES.reportesAtenciones, periodo),
  },
  copias: {
    estado: () => pedir(CANALES.copiasEstado),
    exportar: () => pedir(CANALES.copiasExportar),
    elegir: () => pedir(CANALES.copiasElegir),
    restaurar: () => pedir(CANALES.copiasRestaurar),
    abrirCarpeta: () => pedir(CANALES.copiasAbrirCarpeta),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
    resumen: () => pedir(CANALES.sistemaResumen),
    cargarEjemplo: () => pedir(CANALES.sistemaEjemplo),
    cargarTurnosEjemplo: () => pedir(CANALES.sistemaEjemploTurnos),
  },
};

contextBridge.exposeInMainWorld('turnos', api);
