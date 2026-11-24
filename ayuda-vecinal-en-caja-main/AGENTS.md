# Reglas del proyecto

- La ejecución actual usa SQLite. Emplea `database/schema.sql` y `src/server/local/` para el acceso a datos. Cada operación de negocio debe usar el ID de la sesión y consultar solo los registros de esa tienda.
- Ejecuta las altas, ediciones y anulaciones de ventas o compras a través de `writeLedger` y `removeLedger` en `src/server/local/ledger.ts`. Allí se ajustan las existencias con los registros de movimientos dentro de la transacción.
- Usa `src/lib/finance.ts` para los cálculos financieros compartidos por la interfaz y VeciBot. Los importes se almacenan en centavos. Las compras de mercadería se contabilizan como costo al venderse.
- Agrupa las fechas en America/Guayaquil. Mantén el texto de la interfaz en español y los colores en los tokens de `src/styles.css`.
- VeciBot recibe peticiones autenticadas en `/api/vecibot`, usa `src/lib/vecibotParser.js` y conserva el historial por tienda. Todo guardado debe pasar por una confirmación explícita.
- Usa `npm run seed` para crear la cuenta de demostración. La carga desde la interfaz solo se permite en una tienda vacía. Los ejemplos se identifican como datos de demostración.
- Los esquemas de Supabase y las implementaciones anteriores sirven de referencia. Si trabajas en una rama conectada con Lovable, conserva el historial publicado.
