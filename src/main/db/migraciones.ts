// Migraciones: la lista de cambios de la base, en orden. La versión de la base
// (PRAGMA user_version) dice cuántas ya se aplicaron. REGLA: nunca editar una
// migración que ya se entregó; si hay que cambiar algo, se agrega otra.

export interface Migracion {
  nombre: string;
  sql: string;
}

export const MIGRACIONES: Migracion[] = [
  {
    nombre: 'Veterinaria: veterinarios con horarios, días sin atención, dueños y mascotas',
    sql: /* sql */ `
      CREATE TABLE configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
      INSERT INTO configuracion (clave, valor) VALUES
        ('nombre_veterinaria', 'Mi Veterinaria'),
        ('direccion', ''),
        ('telefono', '');

      CREATE TABLE profesionales (
        id                 INTEGER PRIMARY KEY,
        nombre             TEXT    NOT NULL,
        apellido           TEXT    NOT NULL,
        titulo             TEXT    NOT NULL DEFAULT '',          -- "Dra.", "Lic."…
        especialidad       TEXT    NOT NULL DEFAULT '',
        matricula          TEXT    NOT NULL DEFAULT '',
        color              TEXT    NOT NULL DEFAULT 'eucalipto', -- para distinguirlo en la agenda
        duracion_turno_min INTEGER NOT NULL DEFAULT 30 CHECK (duracion_turno_min BETWEEN 5 AND 240),
        activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      -- Franjas de atención semanales. Un día puede tener varias (mañana y tarde).
      -- dia_semana: 1 = lunes … 7 = domingo. Horas 'HH:MM'.
      CREATE TABLE horarios (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id) ON DELETE CASCADE,
        dia_semana     INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
        desde          TEXT    NOT NULL,
        hasta          TEXT    NOT NULL,
        CHECK (desde < hasta)
      );
      CREATE INDEX horarios_por_profesional ON horarios (profesional_id, dia_semana);

      -- Días sin atención: feriados, vacaciones, congresos. Sin profesional = todo la veterinaria.
      CREATE TABLE bloqueos (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER REFERENCES profesionales (id) ON DELETE CASCADE,
        desde          TEXT    NOT NULL,
        hasta          TEXT    NOT NULL,
        motivo         TEXT    NOT NULL DEFAULT '',
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde <= hasta)
      );

      -- El dueño (quien trae a la mascota y recibe los avisos). Una familia puede tener varias mascotas.
      CREATE TABLE duenos (
        id             INTEGER PRIMARY KEY,
        nombre         TEXT    NOT NULL,
        apellido       TEXT    NOT NULL,
        dni            TEXT,                 -- solo números; puede faltar
        telefono       TEXT    NOT NULL DEFAULT '',
        email          TEXT    NOT NULL DEFAULT '',
        direccion      TEXT    NOT NULL DEFAULT '',
        notas          TEXT    NOT NULL DEFAULT '',   -- administrativas (ej: "paga a fin de mes")
        busqueda       TEXT    NOT NULL DEFAULT '',   -- apellido, nombre, dni y teléfono sin tildes
        activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      -- El DNI no se repite, pero puede no estar cargado (índice único PARCIAL).
      CREATE UNIQUE INDEX duenos_dni_unico ON duenos (dni) WHERE dni IS NOT NULL;
      CREATE INDEX duenos_por_apellido ON duenos (apellido COLLATE NOCASE, nombre COLLATE NOCASE);

      -- La mascota: es quien se atiende. Siempre tiene un dueño.
      CREATE TABLE mascotas (
        id               INTEGER PRIMARY KEY,
        dueno_id         INTEGER NOT NULL REFERENCES duenos (id),
        nombre           TEXT    NOT NULL,
        especie          TEXT    NOT NULL DEFAULT 'perro'
                         CHECK (especie IN ('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otro')),
        raza             TEXT    NOT NULL DEFAULT '',
        sexo             TEXT    CHECK (sexo IN ('macho', 'hembra')),          -- NULL = no se sabe
        castrado         INTEGER NOT NULL DEFAULT 0 CHECK (castrado IN (0, 1)),
        fecha_nacimiento TEXT,                 -- 'AAAA-MM-DD' (aproximada si no se sabe)
        color            TEXT    NOT NULL DEFAULT '',                           -- pelaje / señas
        microchip        TEXT,                 -- solo números; puede faltar
        notas            TEXT    NOT NULL DEFAULT '',                           -- administrativas, NO clínicas
        busqueda         TEXT    NOT NULL DEFAULT '',                           -- nombre, especie, raza y chip sin tildes
        activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE UNIQUE INDEX mascotas_microchip_unico ON mascotas (microchip) WHERE microchip IS NOT NULL;
      CREATE INDEX mascotas_por_dueno ON mascotas (dueno_id);
      CREATE INDEX mascotas_por_nombre ON mascotas (nombre COLLATE NOCASE);
    `,
  },
  {
    nombre: 'Turnos: agenda con estados y sin superposiciones',
    sql: /* sql */ `
      CREATE TABLE turnos (
        id             INTEGER PRIMARY KEY,
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id),
        mascota_id    INTEGER NOT NULL REFERENCES mascotas (id),
        fecha          TEXT    NOT NULL,                -- 'AAAA-MM-DD'
        desde          TEXT    NOT NULL,                -- 'HH:MM'
        hasta          TEXT    NOT NULL,                -- 'HH:MM' (desde + duración)
        estado         TEXT    NOT NULL DEFAULT 'reservado'
                       CHECK (estado IN ('reservado', 'confirmado', 'en_sala', 'atendido', 'ausente', 'cancelado')),
        motivo         TEXT    NOT NULL DEFAULT '',     -- "Control", "Primera vez"… (administrativo)
        llego_en       TEXT,                            -- cuándo pasó a "en sala" (para la sala de espera)
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (desde < hasta)
      );
      CREATE INDEX turnos_por_dia ON turnos (fecha, profesional_id, desde);
      CREATE INDEX turnos_por_mascota ON turnos (mascota_id, fecha);

      -- SEGUNDA LÍNEA DE DEFENSA: aunque el programa ya controla que dos turnos
      -- del mismo profesional no se pisen, la base también se niega. Así, ni un
      -- error del programa ni alguien editando con DB Browser pueden romper la agenda.
      -- Dos turnos se pisan si uno empieza antes de que termine el otro (y al revés).
      -- Los cancelados no cuentan: liberan el horario.
      CREATE TRIGGER turnos_sin_superposicion_al_crear
      BEFORE INSERT ON turnos
      WHEN NEW.estado <> 'cancelado'
      BEGIN
        SELECT RAISE(ABORT, 'turno_superpuesto')
        WHERE EXISTS (
          SELECT 1 FROM turnos t
          WHERE t.profesional_id = NEW.profesional_id AND t.fecha = NEW.fecha AND t.estado <> 'cancelado'
            AND t.desde < NEW.hasta AND NEW.desde < t.hasta
        );
      END;

      CREATE TRIGGER turnos_sin_superposicion_al_cambiar
      BEFORE UPDATE OF profesional_id, fecha, desde, hasta, estado ON turnos
      WHEN NEW.estado <> 'cancelado'
      BEGIN
        SELECT RAISE(ABORT, 'turno_superpuesto')
        WHERE EXISTS (
          SELECT 1 FROM turnos t
          WHERE t.id <> NEW.id
            AND t.profesional_id = NEW.profesional_id AND t.fecha = NEW.fecha AND t.estado <> 'cancelado'
            AND t.desde < NEW.hasta AND NEW.desde < t.hasta
        );
      END;
    `,
  },
  {
    nombre: 'Consultas (historia clínica), cobros, precio de consulta y recordatorios por WhatsApp',
    sql: /* sql */ `
      -- Columnas nuevas en tablas que ya tienen datos: ADD COLUMN con un valor por defecto
      ALTER TABLE profesionales ADD COLUMN precio_consulta_centavos INTEGER NOT NULL DEFAULT 0
        CHECK (precio_consulta_centavos >= 0);
      ALTER TABLE turnos ADD COLUMN recordado_en TEXT;   -- cuándo se mandó el recordatorio

      INSERT INTO configuracion (clave, valor) VALUES
        ('mensaje_recordatorio',
         'Hola {nombre}! Te recordamos el turno de {mascota} con {profesional} el {dia} a las {hora} en {veterinaria}. Por favor, respondé SÍ para confirmar o avisanos si no pueden venir. ¡Gracias!');

      -- Notas de la consulta (historia clínica simple): una por turno.
      CREATE TABLE consultas (
        id             INTEGER PRIMARY KEY,
        turno_id       INTEGER NOT NULL UNIQUE REFERENCES turnos (id),
        mascota_id    INTEGER NOT NULL REFERENCES mascotas (id),
        profesional_id INTEGER NOT NULL REFERENCES profesionales (id),
        fecha          TEXT    NOT NULL,                -- el día del turno
        motivo         TEXT    NOT NULL DEFAULT '',
        evolucion      TEXT    NOT NULL,                -- lo que se vio y se hizo
        diagnostico    TEXT    NOT NULL DEFAULT '',
        indicaciones   TEXT    NOT NULL DEFAULT '',
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX consultas_por_mascota ON consultas (mascota_id, fecha);

      -- Cobro de cada turno (lo que paga el dueño). Se ANULAN, no se borran.
      CREATE TABLE cobros (
        id                  INTEGER PRIMARY KEY,
        turno_id            INTEGER NOT NULL REFERENCES turnos (id),
        monto_centavos      INTEGER NOT NULL DEFAULT 0 CHECK (monto_centavos >= 0),
        metodo              TEXT    CHECK (metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        anulado             INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        anulado_en          TEXT,
        creado_en           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (monto_centavos = 0 OR metodo IS NOT NULL)
      );
      -- Un solo cobro vigente por turno (los anulados no cuentan): índice único PARCIAL
      CREATE UNIQUE INDEX cobros_uno_por_turno ON cobros (turno_id) WHERE anulado = 0;
    `,
  },
  {
    nombre: 'Usuarios con PIN y roles; quién dio cada turno, quién cobró y quién escribió cada consulta',
    sql: /* sql */ `
      -- El PIN NO se guarda: se guarda su "huella" (hash) con una sal al azar.
      -- profesional_id vincula al usuario con su ficha de profesional: es lo que
      -- le permite ver la historia clínica y cargar las notas de SUS turnos.
      CREATE TABLE usuarios (
        id             INTEGER PRIMARY KEY,
        nombre         TEXT    NOT NULL,
        rol            TEXT    NOT NULL CHECK (rol IN ('admin', 'recepcion', 'profesional')),
        profesional_id INTEGER REFERENCES profesionales (id),
        pin_hash       TEXT    NOT NULL,
        pin_sal        TEXT    NOT NULL,
        activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (rol <> 'profesional' OR profesional_id IS NOT NULL),
        CHECK (rol <> 'recepcion' OR profesional_id IS NULL)
      );
      CREATE UNIQUE INDEX usuarios_nombre_unico ON usuarios (nombre COLLATE NOCASE) WHERE activo = 1;
      -- Un solo usuario (activo) por profesional
      CREATE UNIQUE INDEX usuarios_uno_por_profesional ON usuarios (profesional_id) WHERE activo = 1 AND profesional_id IS NOT NULL;

      -- Quién hizo cada cosa (NULL en lo cargado antes de que hubiera usuarios)
      ALTER TABLE turnos ADD COLUMN dado_por INTEGER REFERENCES usuarios (id);
      ALTER TABLE consultas ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
      ALTER TABLE cobros ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
    `,
  },
  {
    nombre: 'Consultas: peso y temperatura de la mascota',
    sql: /* sql */ `
      -- Peso en GRAMOS y temperatura en DÉCIMAS de grado (enteros, como el dinero en
      -- centavos): 12,5 kg = 12500 y 38,5 °C = 385. Son opcionales: no siempre se miden.
      -- Los CHECK son la segunda defensa: la primera es el esquema Zod.
      ALTER TABLE consultas ADD COLUMN peso_gramos INTEGER CHECK (peso_gramos IS NULL OR peso_gramos BETWEEN 50 AND 150000);
      ALTER TABLE consultas ADD COLUMN temperatura_decimas INTEGER CHECK (temperatura_decimas IS NULL OR temperatura_decimas BETWEEN 300 AND 450);
    `,
  },
  {
    nombre: 'Vacunas y desparasitaciones con aviso de próxima dosis',
    sql: /* sql */ `
      -- El carnet de la mascota: una fila por aplicación. Como los cobros, NO se borran:
      -- una carga equivocada se ANULA (queda el rastro de quién y cuándo).
      CREATE TABLE aplicaciones (
        id             INTEGER PRIMARY KEY,
        mascota_id     INTEGER NOT NULL REFERENCES mascotas (id),
        tipo           TEXT    NOT NULL CHECK (tipo IN ('vacuna', 'desparasitacion')),
        nombre         TEXT    NOT NULL,                 -- "Antirrábica", "Desparasitación interna"…
        clave          TEXT    NOT NULL,                 -- el nombre sin tildes ni mayúsculas: así "antirrabica" y "Antirrábica" son lo mismo
        fecha          TEXT    NOT NULL,                 -- cuándo se aplicó
        proxima_dosis  TEXT,                             -- cuándo toca la siguiente (NULL = no hay)
        lote           TEXT    NOT NULL DEFAULT '',
        notas          TEXT    NOT NULL DEFAULT '',
        profesional_id INTEGER REFERENCES profesionales (id),
        usuario_id     INTEGER REFERENCES usuarios (id),
        avisado_en     TEXT,                             -- cuándo se le avisó al dueño de la próxima dosis
        anulado        INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        anulado_en     TEXT,
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (proxima_dosis IS NULL OR proxima_dosis > fecha)
      );
      CREATE INDEX aplicaciones_por_mascota ON aplicaciones (mascota_id, fecha);
      -- Para la lista de dosis que tocan: solo las vigentes y con próxima fecha
      CREATE INDEX aplicaciones_por_dosis ON aplicaciones (proxima_dosis) WHERE anulado = 0 AND proxima_dosis IS NOT NULL;

      INSERT INTO configuracion (clave, valor) VALUES
        ('mensaje_vacuna',
         'Hola {nombre}! Te escribimos de {veterinaria}: a {mascota} le toca la próxima dosis de {vacuna} (fecha: {fecha}). Podés pasar o pedir turno cuando quieras. ¡Gracias!');
    `,
  },
  {
    nombre: 'Productos, stock y ventas del mostrador',
    sql: /* sql */ `
      -- Cantidades en MILÉSIMAS enteras (1 unidad = 1000, 1,5 kg = 1500) y dinero en centavos.
      CREATE TABLE productos (
        id                    INTEGER PRIMARY KEY,
        codigo                TEXT,                      -- código de barras o interno (opcional)
        nombre                TEXT    NOT NULL,
        categoria             TEXT    NOT NULL CHECK (categoria IN ('alimento', 'medicamento', 'higiene', 'accesorio', 'otro')),
        unidad                TEXT    NOT NULL DEFAULT 'unidad' CHECK (unidad IN ('unidad', 'kg')),
        costo_centavos        INTEGER NOT NULL DEFAULT 0 CHECK (costo_centavos >= 0),
        precio_centavos       INTEGER NOT NULL CHECK (precio_centavos > 0),
        stock_minimo_milesimas INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo_milesimas >= 0),
        activo                INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        busqueda              TEXT    NOT NULL,          -- nombre, código y categoría sin tildes, para buscar
        creado_en             TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      -- El código no se repite, pero puede faltar: índice único PARCIAL
      CREATE UNIQUE INDEX productos_codigo_unico ON productos (codigo) WHERE codigo IS NOT NULL;

      -- El stock NO se guarda en el producto: es la suma de sus movimientos vigentes.
      CREATE TABLE ventas (
        id             INTEGER PRIMARY KEY,
        fecha          TEXT    NOT NULL,
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        metodo         TEXT    NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        usuario_id     INTEGER REFERENCES usuarios (id),
        anulada        INTEGER NOT NULL DEFAULT 0 CHECK (anulada IN (0, 1)),
        anulada_en     TEXT,
        creado_en      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX ventas_por_fecha ON ventas (fecha);

      -- Precio y costo quedan como "foto" del momento: cambiar el precio después no toca las ventas viejas.
      CREATE TABLE venta_items (
        id                INTEGER PRIMARY KEY,
        venta_id          INTEGER NOT NULL REFERENCES ventas (id),
        producto_id       INTEGER NOT NULL REFERENCES productos (id),
        nombre            TEXT    NOT NULL,
        cantidad_milesimas INTEGER NOT NULL CHECK (cantidad_milesimas > 0),
        precio_centavos   INTEGER NOT NULL,              -- por unidad o por kilo
        costo_centavos    INTEGER NOT NULL,
        subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0)
      );
      CREATE INDEX venta_items_por_venta ON venta_items (venta_id);

      CREATE TABLE movimientos_stock (
        id                 INTEGER PRIMARY KEY,
        producto_id        INTEGER NOT NULL REFERENCES productos (id),
        tipo               TEXT    NOT NULL CHECK (tipo IN ('inicial', 'compra', 'venta', 'merma', 'ajuste')),
        cantidad_milesimas INTEGER NOT NULL CHECK (cantidad_milesimas <> 0),   -- + entra, − sale
        costo_centavos     INTEGER,
        motivo             TEXT    NOT NULL DEFAULT '',
        fecha              TEXT    NOT NULL,
        venta_id           INTEGER REFERENCES ventas (id),
        usuario_id         INTEGER REFERENCES usuarios (id),
        anulado            INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK (tipo <> 'venta' OR venta_id IS NOT NULL)
      );
      CREATE INDEX movimientos_por_producto ON movimientos_stock (producto_id, fecha);
      CREATE INDEX movimientos_por_venta ON movimientos_stock (venta_id) WHERE venta_id IS NOT NULL;
    `,
  },
  {
    nombre: 'Internación y baños/peluquería',
    sql: /* sql */ `
      -- Una mascota internada tiene egreso NULL; al darla de alta se guardan el egreso y lo cobrado.
      CREATE TABLE internaciones (
        id                     INTEGER PRIMARY KEY,
        mascota_id             INTEGER NOT NULL REFERENCES mascotas (id),
        profesional_id         INTEGER REFERENCES profesionales (id),
        usuario_id             INTEGER REFERENCES usuarios (id),
        ingreso                TEXT    NOT NULL,
        motivo                 TEXT    NOT NULL,
        lugar                  TEXT    NOT NULL DEFAULT '',
        tarifa_diaria_centavos INTEGER NOT NULL DEFAULT 0 CHECK (tarifa_diaria_centavos >= 0),
        egreso                 TEXT,
        total_centavos         INTEGER CHECK (total_centavos IS NULL OR total_centavos >= 0),
        metodo                 TEXT    CHECK (metodo IS NULL OR metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        creado_en              TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK ((egreso IS NULL) = (total_centavos IS NULL)),
        CHECK (egreso IS NULL OR egreso >= ingreso)
      );
      -- Una mascota no puede estar internada dos veces a la vez
      CREATE UNIQUE INDEX internacion_una_activa ON internaciones (mascota_id) WHERE egreso IS NULL;
      CREATE INDEX internaciones_por_egreso ON internaciones (egreso);

      CREATE TABLE evoluciones_internacion (
        id                 INTEGER PRIMARY KEY,
        internacion_id     INTEGER NOT NULL REFERENCES internaciones (id),
        momento            TEXT    NOT NULL,
        texto              TEXT    NOT NULL,
        temperatura_decimas INTEGER CHECK (temperatura_decimas IS NULL OR temperatura_decimas BETWEEN 300 AND 450),
        usuario_id         INTEGER REFERENCES usuarios (id),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX evoluciones_por_internacion ON evoluciones_internacion (internacion_id, momento);

      CREATE TABLE servicios_estetica (
        id              INTEGER PRIMARY KEY,
        mascota_id      INTEGER NOT NULL REFERENCES mascotas (id),
        fecha           TEXT    NOT NULL,
        tipo            TEXT    NOT NULL CHECK (tipo IN ('bano', 'bano_corte', 'corte', 'unas', 'deslanado')),
        precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
        estado          TEXT    NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'en_proceso', 'listo', 'entregado', 'cancelado')),
        notas           TEXT    NOT NULL DEFAULT '',
        metodo          TEXT    CHECK (metodo IS NULL OR metodo IN ('efectivo', 'transferencia', 'debito', 'credito')),
        avisado_en      TEXT,
        entregado_en    TEXT,
        usuario_id      INTEGER REFERENCES usuarios (id),
        creado_en       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        CHECK ((estado = 'entregado') = (entregado_en IS NOT NULL))
      );
      CREATE INDEX estetica_por_fecha ON servicios_estetica (fecha, estado);

      INSERT INTO configuracion (clave, valor) VALUES
        ('mensaje_listo',
         'Hola {nombre}! {mascota} ya está lista ({servicio}). Podés pasar a retirarla cuando quieras. {veterinaria}');
    `,
  },
];
