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
  vacunas: {
    carnet: (mascotaId) => pedir(CANALES.vacunasCarnet, mascotaId),
    registrar: (datos) => pedir(CANALES.vacunasRegistrar, datos),
    anular: (id) => pedir(CANALES.vacunasAnular, id),
    pendientes: (filtro) => pedir(CANALES.vacunasPendientes, filtro),
    vencidas: () => pedir(CANALES.vacunasVencidas),
    avisar: (aplicacionId) => pedir(CANALES.vacunasAvisar, aplicacionId),
  },
  internacion: {
    internadas: () => pedir(CANALES.internacionInternadas),
    altas: () => pedir(CANALES.internacionAltas),
    ingresar: (datos) => pedir(CANALES.internacionIngresar, datos),
    evoluciones: (internacionId) => pedir(CANALES.internacionEvoluciones, internacionId),
    evolucionar: (datos) => pedir(CANALES.internacionEvolucionar, datos),
    alta: (datos) => pedir(CANALES.internacionAlta, datos),
    cantidad: () => pedir(CANALES.internacionCantidad),
  },
  estetica: {
    tablero: () => pedir(CANALES.esteticaTablero),
    crear: (datos) => pedir(CANALES.esteticaCrear, datos),
    cambiar: (datos) => pedir(CANALES.esteticaCambiar, datos),
    avisar: (id) => pedir(CANALES.esteticaAvisar, id),
    precios: () => pedir(CANALES.esteticaPrecios),
  },
  productos: {
    buscar: (filtro) => pedir(CANALES.productosBuscar, filtro),
    guardar: (datos) => pedir(CANALES.productosGuardar, datos),
    cambiarActivo: (id, activo) => pedir(CANALES.productosActivo, id, activo),
    movimiento: (datos) => pedir(CANALES.productosMovimiento, datos),
    movimientos: (productoId) => pedir(CANALES.productosMovimientos, productoId),
    paraReponer: () => pedir(CANALES.productosParaReponer),
  },
  ventas: {
    registrar: (datos) => pedir(CANALES.ventasRegistrar, datos),
    anular: (id) => pedir(CANALES.ventasAnular, id),
    delDia: (fecha) => pedir(CANALES.ventasDelDia, fecha),
  },
  cobros: {
    registrar: (datos) => pedir(CANALES.cobrosRegistrar, datos),
    anular: (id) => pedir(CANALES.cobrosAnular, id),
  },
  veterinaria: {
    obtener: () => pedir(CANALES.veterinariaObtener),
    guardar: (datos) => pedir(CANALES.veterinariaGuardar, datos),
    guardarMensaje: (mensaje) => pedir(CANALES.veterinariaMensaje, mensaje),
    guardarMensajeVacuna: (mensaje) => pedir(CANALES.veterinariaMensajeVacuna, mensaje),
    guardarMensajeListo: (mensaje) => pedir(CANALES.veterinariaMensajeListo, mensaje),
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
    cargarVacunasEjemplo: () => pedir(CANALES.sistemaEjemploVacunas),
    cargarProductosEjemplo: () => pedir(CANALES.sistemaEjemploProductos),
    cargarServiciosEjemplo: () => pedir(CANALES.sistemaEjemploServicios),
  },
};

contextBridge.exposeInMainWorld('turnos', api);
