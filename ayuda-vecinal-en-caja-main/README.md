# AyúdateVeci

Aplicación local para tiendas de barrio en Ecuador. Incluye inventario, ventas y compras, libreta de fiados, gastos, reportes y VeciBot. Los importes se guardan en centavos de USD. El panel agrupa las operaciones según la hora de Ecuador continental.

## Instalar y ejecutar

Necesitas **Node.js 24 o posterior** y npm. Abre una terminal en la carpeta que contiene `package.json`. Si estás en la carpeta exterior de la descarga, entra primero en `ayuda-vecinal-en-caja-main`.

En Windows PowerShell:

```powershell
node --version
npm.cmd ci
npm.cmd run seed
npm.cmd run dev
```

En macOS, Linux o una terminal compatible:

```bash
node --version
npm ci
npm run seed
npm run dev
```

Abre **http://localhost:3000/auth** y pulsa **Entrar a la tienda de demostración**. También puedes escribir `demo@ayudateveci.local` y `VeciDemo2026!`. El catálogo de ejemplo incluye 12 productos y movimientos de ventas, compras y fiados. **Crear cuenta** abre una tienda vacía e independiente.

El comando `seed` crea `data/ayudateveci.sqlite` y carga la tienda de ejemplo. Ejecutarlo otra vez conserva los registros existentes. Puedes indicar otra base con la variable de entorno del sistema `AYUDATEVECI_DB`.

Para servir la aplicación compilada, detén primero Vite con `Ctrl+C` y ejecuta:

```powershell
npm.cmd run build
npm.cmd start
```

Abre la misma URL. Los comandos se ejecutan desde la carpeta del proyecto. En macOS o Linux, usa `npm` en lugar de `npm.cmd`.

## Cómo usar VeciBot

- **Texto.** Prueba «Vendí dos leches y cinco panes», «Vendí tres panes a 20 centavos fiado a Doña Rosa» o «¿Cuánto gané hoy?». El parser interpreta «un real» como USD 0,10. Las cantidades se registran en unidades enteras del catálogo. Si el producto se vende por libra, funda, cubeta o quintal, configura esa unidad en Productos.
- **Voz.** Pulsa **Dictar**, concede permiso y habla. VeciBot envía el texto al terminar el reconocimiento o tras una pausa. Usa un navegador con Web Speech API en localhost. El reconocimiento puede depender de la conexión y del servicio de voz del navegador.
- **Factura.** Adjunta JPEG, PNG, WebP, PDF, XLSX o CSV (hasta 5 MB). Para Excel usa la primera hoja y ordena las columnas como **Producto, Cantidad, Costo unitario**. VeciBot extrae texto de PDF seleccionable y lee filas de Excel o CSV en el navegador. Las fotos y PDFs escaneados quedan disponibles como referencia para completar la tarjeta manualmente. Para una anotación de venta o fiado, acompaña la foto con el mensaje correspondiente. Los originales se guardan en el navegador donde se adjuntaron.
- **Modo Demo.** Abre sus tres ejemplos de venta por voz simulada, fiado y factura PDF. Cada uno prepara una tarjeta. Los movimientos se registran únicamente al pulsar **Confirmar y Guardar**.

## Registros y datos

- Para fiar en el flujo manual, elige **Fiado** en Ventas y escribe el cliente. Cuando te pague, usa **Marcar como Pagado** en la libreta. El cobro reduce el saldo pendiente y conserva el movimiento original de venta.
- En el historial de Ventas y Compras, abre un registro para editarlo o anularlo. El servidor ajusta el stock en la misma transacción. Una anulación de compra se rechaza si deja stock negativo.
- Las ganancias del panel descuentan el costo histórico de los productos vendidos y los gastos operativos. El ranking cuenta unidades del mes. Los combos usan las ventas de los últimos 30 días y el stock actual.
- Para recuperar una contraseña, ejecuta `npm run db:password -- tu-correo` desde una terminal interactiva del equipo que tiene la base. La contraseña se introduce sin mostrarla.

## Código y verificación

- `database/schema.sql` define las tablas SQLite y sus relaciones.
- `src/server/local/` implementa autenticación, operaciones de tienda, transacciones y el endpoint local de VeciBot.
- `src/lib/vecibotParser.js` clasifica los mensajes y genera propuestas. Se puede sustituir el clasificador conservando el formato de borradores y la confirmación.
- `src/routes/_authenticated/` contiene las pantallas. Tanto VeciBot como los formularios guardan a través de la misma API local.
- `npm test` ejecuta las pruebas. `npx tsc --noEmit` comprueba los tipos.

La ejecución local funciona sin credenciales de Supabase ni claves de IA. Los registros previos alojados en Supabase requieren una migración de datos independiente. Los documentos `docs/vecibot-multimedia.md` y `docs/vecibot-ia-audit.md` describen integraciones anteriores.
