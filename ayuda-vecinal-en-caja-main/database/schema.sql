CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tienda TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password TEXT NOT NULL,
  barrio TEXT NOT NULL DEFAULT '',
  direccion TEXT,
  telefono TEXT,
  correo_contacto TEXT,
  minimo_predeterminado INTEGER NOT NULL DEFAULT 5,
  alertas INTEGER NOT NULL DEFAULT 1,
  datos_demo INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  precio_compra INTEGER NOT NULL CHECK(precio_compra >= 0),
  precio_venta INTEGER NOT NULL CHECK(precio_venta >= 0),
  stock INTEGER NOT NULL CHECK(stock >= 0),
  stock_minimo INTEGER NOT NULL CHECK(stock_minimo >= 0),
  unidad TEXT NOT NULL,
  proveedor TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  total INTEGER NOT NULL CHECK(total >= 0),
  costo_total INTEGER NOT NULL CHECK(costo_total >= 0),
  tipo_pago TEXT NOT NULL CHECK(tipo_pago IN ('Pagado', 'Fiado')),
  cliente_fiado TEXT,
  estado_fiado TEXT CHECK(estado_fiado IN ('Pendiente', 'Pagado')),
  fecha_cobro TEXT,
  notas TEXT,
  creado TEXT NOT NULL,
  CHECK((tipo_pago = 'Pagado' AND cliente_fiado IS NULL AND estado_fiado IS NULL)
     OR (tipo_pago = 'Fiado' AND cliente_fiado IS NOT NULL AND estado_fiado IS NOT NULL))
) STRICT;

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id TEXT PRIMARY KEY,
  venta_id TEXT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id TEXT REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK(precio_unitario >= 0),
  costo_unitario INTEGER NOT NULL CHECK(costo_unitario >= 0),
  subtotal INTEGER NOT NULL CHECK(subtotal >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS compras (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  proveedor TEXT,
  total INTEGER NOT NULL CHECK(total >= 0),
  notas TEXT,
  actualiza_costo INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS detalle_compras (
  id TEXT PRIMARY KEY,
  compra_id TEXT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id TEXT REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  costo_unitario INTEGER NOT NULL CHECK(costo_unitario >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK(monto > 0),
  fecha TEXT NOT NULL,
  notas TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS movimientos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producto_id TEXT REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  referencia_id TEXT,
  stock_final INTEGER NOT NULL,
  nota TEXT,
  creado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  creado TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS operaciones (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  recurso_id TEXT NOT NULL,
  PRIMARY KEY(usuario_id, clave)
) STRICT;

CREATE INDEX IF NOT EXISTS productos_usuario ON productos(usuario_id, nombre);
CREATE INDEX IF NOT EXISTS ventas_usuario_fecha ON ventas(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS compras_usuario_fecha ON compras(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS gastos_usuario_fecha ON gastos(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS movimientos_usuario_fecha ON movimientos(usuario_id, creado);
CREATE INDEX IF NOT EXISTS chat_usuario ON chat_messages(usuario_id);
CREATE INDEX IF NOT EXISTS detalle_ventas_venta ON detalle_ventas(venta_id);
CREATE INDEX IF NOT EXISTS detalle_compras_compra ON detalle_compras(compra_id);
CREATE INDEX IF NOT EXISTS detalle_ventas_producto ON detalle_ventas(producto_id);
CREATE INDEX IF NOT EXISTS detalle_compras_producto ON detalle_compras(producto_id);
CREATE INDEX IF NOT EXISTS movimientos_producto ON movimientos(producto_id);

CREATE TABLE IF NOT EXISTS historial_costos (
  id INTEGER PRIMARY KEY,
  producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  compra_id TEXT REFERENCES compras(id) ON DELETE CASCADE,
  costo INTEGER NOT NULL CHECK(costo >= 0),
  UNIQUE(producto_id, compra_id)
) STRICT;