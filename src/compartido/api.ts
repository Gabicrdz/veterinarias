// El contrato entre la ventana y el main: qué funciones existen, qué reciben
// y qué devuelven. El preload lo implementa; la ventana lo usa como window.turnos.
import type {
  DatosAplicacion,
  DatosBuscarProductos,
  DatosMovimiento,
  DatosProducto,
  DatosVenta,
  DatosBloqueo,
  DatosPendientes,
  DatosBuscarDuenos,
  DatosBuscarMascotas,
  DatosCobro,
  DatosConsulta,
  DatosVeterinaria,
  DatosMoverTurno,
  DatosPeriodo,
  DatosMascota,
  DatosProfesional,
  DatosRango,
  DatosTurno,
  DatosUsuario,
} from './esquemas';
import type { EstadoTurno } from './agenda';
import type {
  Agenda,
  Aplicacion,
  DosisPendiente,
  Bloqueo,
  BloqueoCreado,
  Consulta,
  Veterinaria,
  CopiaElegida,
  EstadoCopias,
  InfoCopia,
  HorarioLibre,
  InfoSistema,
  Dueno,
  Mascota,
  MovimientoStock,
  Producto,
  VentasDelDia,
  Profesional,
  Reporte,
  Respuesta,
  ResultadoEjemplo,
  Resumen,
  TurnosDeMascota,
  Usuario,
} from './tipos';

export interface ApiTurnos {
  sesion: {
    /** Quién está usando el sistema (null = nadie: pantalla de ingreso). */
    actual(): Promise<Respuesta<Usuario | null>>;
    iniciar(usuarioId: number, pin: string): Promise<Respuesta<Usuario>>;
    cerrar(): Promise<Respuesta<null>>;
  };
  usuarios: {
    /** Para la pantalla de ingreso: solo nombre y rol. */
    paraIngresar(): Promise<Respuesta<Usuario[]>>;
    /** Solo la primera vez (sin usuarios): crea el de administración y entra. */
    crearPrimero(nombre: string, pin: string): Promise<Respuesta<Usuario>>;
    listar(): Promise<Respuesta<Usuario[]>>;
    guardar(datos: DatosUsuario): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
  mascotas: {
    buscar(filtro: DatosBuscarMascotas): Promise<Respuesta<Mascota[]>>;
    /** Dueños ya cargados (para sumarles otra mascota sin cargarlos de nuevo). */
    buscarDuenos(filtro: DatosBuscarDuenos): Promise<Respuesta<Dueno[]>>;
    guardar(datos: DatosMascota): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  profesionales: {
    listar(): Promise<Respuesta<Profesional[]>>;
    guardar(datos: DatosProfesional): Promise<Respuesta<number>>;
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
  };
  bloqueos: {
    /** Los que terminan hoy o después (los viejos no hacen falta). */
    proximos(): Promise<Respuesta<Bloqueo[]>>;
    crear(datos: DatosBloqueo): Promise<Respuesta<BloqueoCreado>>;
    borrar(id: number): Promise<Respuesta<null>>;
  };
  turnos: {
    /** Turnos y días sin atención de un rango (un día o una semana). */
    agenda(rango: DatosRango): Promise<Respuesta<Agenda>>;
    /** Horarios libres de un profesional en un día (sin los que ya pasaron). */
    libres(profesionalId: number, fecha: string): Promise<Respuesta<string[]>>;
    /** Los próximos horarios libres de un profesional, desde ahora. */
    proximosLibres(profesionalId: number): Promise<Respuesta<HorarioLibre[]>>;
    dar(datos: DatosTurno): Promise<Respuesta<number>>;
    mover(datos: DatosMoverTurno): Promise<Respuesta<null>>;
    cambiarEstado(id: number, estado: EstadoTurno): Promise<Respuesta<null>>;
    deMascota(mascotaId: number): Promise<Respuesta<TurnosDeMascota>>;
    /** Abre WhatsApp con el recordatorio ya escrito y anota que se mandó. */
    recordar(id: number): Promise<Respuesta<null>>;
  };
  consultas: {
    /** Historia clínica de la mascota, de la más nueva a la más vieja. */
    historia(mascotaId: number): Promise<Respuesta<Consulta[]>>;
    /** Guarda las notas de la consulta y deja el turno como atendido. */
    guardar(datos: DatosConsulta): Promise<Respuesta<number>>;
  };
  vacunas: {
    /** El carnet de la mascota. */
    carnet(mascotaId: number): Promise<Respuesta<Aplicacion[]>>;
    registrar(datos: DatosAplicacion): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<null>>;
    /** Dosis vencidas y las que tocan en los próximos días. */
    pendientes(filtro: DatosPendientes): Promise<Respuesta<DosisPendiente[]>>;
    /** Cuántas dosis están vencidas (para el número del menú). */
    vencidas(): Promise<Respuesta<number>>;
    /** Abre WhatsApp con el aviso ya escrito y anota que se avisó. */
    avisar(aplicacionId: number): Promise<Respuesta<null>>;
  };
  productos: {
    buscar(filtro: DatosBuscarProductos): Promise<Respuesta<Producto[]>>;
    /** Solo administración: alta y edición (el stock se mueve con `movimiento`, no desde acá). */
    guardar(datos: DatosProducto): Promise<Respuesta<number>>;
    /** Solo administración: baja y alta lógica. */
    cambiarActivo(id: number, activo: boolean): Promise<Respuesta<null>>;
    /** Entrada por compra (cualquiera); merma y ajuste por conteo (solo administración). */
    movimiento(datos: DatosMovimiento): Promise<Respuesta<null>>;
    movimientos(productoId: number): Promise<Respuesta<MovimientoStock[]>>;
    /** Cuántos productos están con stock bajo o sin stock (para el número del menú). */
    paraReponer(): Promise<Respuesta<number>>;
  };
  ventas: {
    registrar(datos: DatosVenta): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<null>>;
    delDia(fecha: string): Promise<Respuesta<VentasDelDia>>;
  };
  cobros: {
    registrar(datos: DatosCobro): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<null>>;
  };
  veterinaria: {
    obtener(): Promise<Respuesta<Veterinaria>>;
    guardar(datos: DatosVeterinaria): Promise<Respuesta<null>>;
    guardarMensaje(mensaje: string): Promise<Respuesta<null>>;
    guardarMensajeVacuna(mensaje: string): Promise<Respuesta<null>>;
  };
  /** Solo administración. */
  reportes: {
    obtener(periodo: DatosPeriodo): Promise<Respuesta<Reporte>>;
    /** Guarda un CSV con las atenciones del período (null si se canceló el diálogo). */
    exportarAtenciones(periodo: DatosPeriodo): Promise<Respuesta<{ ruta: string; cantidad: number } | null>>;
  };
  /** Copias de seguridad (solo administración). */
  copias: {
    estado(): Promise<Respuesta<EstadoCopias>>;
    exportar(): Promise<Respuesta<InfoCopia | null>>;
    elegir(): Promise<Respuesta<CopiaElegida | null>>;
    /** Restaura la copia elegida y reinicia el programa. */
    restaurar(): Promise<Respuesta<null>>;
    abrirCarpeta(): Promise<Respuesta<null>>;
  };
  sistema: {
    info(): Promise<Respuesta<InfoSistema>>;
    resumen(): Promise<Respuesta<Resumen>>;
    /** Carga veterinarios, dueños y mascotas de ejemplo (solo si no hay mascotas). */
    cargarEjemplo(): Promise<Respuesta<ResultadoEjemplo>>;
    /** Carga turnos de ejemplo (2 semanas atrás y 2 adelante), solo si no hay turnos. */
    cargarTurnosEjemplo(): Promise<Respuesta<number>>;
    /** Carga carnets de vacunación de ejemplo, solo si todavía no hay vacunas. Devuelve cuántas aplicaciones cargó. */
    cargarVacunasEjemplo(): Promise<Respuesta<number>>;
    /** Carga productos con stock y ventas de ejemplo, solo si todavía no hay productos. Devuelve cuántas ventas cargó. */
    cargarProductosEjemplo(): Promise<Respuesta<number>>;
  };
}

export const CANALES = {
  sesionActual: 'sesion:actual',
  sesionIniciar: 'sesion:iniciar',
  sesionCerrar: 'sesion:cerrar',
  usuariosParaIngresar: 'usuarios:para-ingresar',
  usuariosCrearPrimero: 'usuarios:crear-primero',
  usuariosListar: 'usuarios:listar',
  usuariosGuardar: 'usuarios:guardar',
  usuariosBaja: 'usuarios:baja',
  mascotasBuscar: 'mascotas:buscar',
  duenosBuscar: 'duenos:buscar',
  mascotasGuardar: 'mascotas:guardar',
  mascotasActivo: 'mascotas:activo',
  profesionalesListar: 'profesionales:listar',
  profesionalesGuardar: 'profesionales:guardar',
  profesionalesActivo: 'profesionales:activo',
  bloqueosProximos: 'bloqueos:proximos',
  bloqueosCrear: 'bloqueos:crear',
  bloqueosBorrar: 'bloqueos:borrar',
  turnosAgenda: 'turnos:agenda',
  turnosLibres: 'turnos:libres',
  turnosProximosLibres: 'turnos:proximos-libres',
  turnosDar: 'turnos:dar',
  turnosMover: 'turnos:mover',
  turnosEstado: 'turnos:estado',
  turnosDeMascota: 'turnos:de-mascota',
  turnosRecordar: 'turnos:recordar',
  consultasHistoria: 'consultas:historia',
  consultasGuardar: 'consultas:guardar',
  vacunasCarnet: 'vacunas:carnet',
  vacunasRegistrar: 'vacunas:registrar',
  vacunasAnular: 'vacunas:anular',
  vacunasPendientes: 'vacunas:pendientes',
  vacunasVencidas: 'vacunas:vencidas',
  vacunasAvisar: 'vacunas:avisar',
  productosBuscar: 'productos:buscar',
  productosGuardar: 'productos:guardar',
  productosActivo: 'productos:activo',
  productosMovimiento: 'productos:movimiento',
  productosMovimientos: 'productos:movimientos',
  productosParaReponer: 'productos:para-reponer',
  ventasRegistrar: 'ventas:registrar',
  ventasAnular: 'ventas:anular',
  ventasDelDia: 'ventas:del-dia',
  cobrosRegistrar: 'cobros:registrar',
  cobrosAnular: 'cobros:anular',
  veterinariaObtener: 'veterinaria:obtener',
  veterinariaGuardar: 'veterinaria:guardar',
  veterinariaMensaje: 'veterinaria:mensaje',
  veterinariaMensajeVacuna: 'veterinaria:mensaje-vacuna',
  sistemaInfo: 'sistema:info',
  sistemaResumen: 'sistema:resumen',
  sistemaEjemplo: 'sistema:ejemplo',
  reportesObtener: 'reportes:obtener',
  reportesAtenciones: 'reportes:atenciones',
  copiasEstado: 'copias:estado',
  copiasExportar: 'copias:exportar',
  copiasElegir: 'copias:elegir',
  copiasRestaurar: 'copias:restaurar',
  copiasAbrirCarpeta: 'copias:abrir-carpeta',
  sistemaEjemploTurnos: 'sistema:ejemplo-turnos',
  sistemaEjemploVacunas: 'sistema:ejemplo-vacunas',
  sistemaEjemploProductos: 'sistema:ejemplo-productos',
} as const;
