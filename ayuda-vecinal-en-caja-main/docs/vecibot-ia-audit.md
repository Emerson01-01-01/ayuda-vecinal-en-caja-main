# Revisión de IA existente — 16 de noviembre de 2026

Condiciones aplicadas: sin pagos, nuevas claves, instalaciones, dependencias nuevas ni modelos descargados. No se hicieron llamadas de generación a ningún proveedor ni se modificaron datos de la tienda.

## Evidencia del proyecto

- `src/server/ai/config.server.ts` no habilita ningún proveedor de IA ni lee credenciales de proveedores. Los contratos del chat se conservan con un error explícito de servicio no habilitado.
- `GET http://127.0.0.1:5173/api/vecibot` respondió 200 JSON con `aiConfigured: false`. La generación de IA sigue devolviendo 503 con la limitación explícita; la recepción de texto y adjuntos funciona por separado en `/api/vecibot-mensajes` y no exige IA.
- `supabase/` contiene `config.toml`, sin código de Edge Functions ni funciones de IA declaradas. El código de la aplicación no invoca funciones remotas de Supabase ni un gateway de Lovable.
- La ruta conocida `https://ayuda-vecinal-en-caja.lovable.app/api/vecibot` respondió 200 con `text/html`, no con el contrato JSON/SSE de esta API. No se usa como respaldo ni se inventan nombres de funciones remotas.
- `.lovable/project.json` identifica una plantilla de desarrollo; no constituye una integración de inferencia ni una prueba de saldo gratuito.
- La descripción OpenAPI accesible de la API de datos respondió 200 y documentó 6 RPC públicas; ninguna estaba relacionada con IA o chat. Esto no enumera Edge Functions remotas ni da acceso a su código o facturación.

## Qué no pudo verificarse

La clave pública de Supabase identifica el proyecto, pero no concede permisos de administración para listar Edge Functions o consultar su facturación. No hay un token de administración configurado. Los conectores de Supabase y Lovable encontrados en el catálogo no están instalados/conectados. No se instaló ni conectó ninguno. El control del navegador devuelve host/pipe no disponible, por lo que no se pudieron inspeccionar sesiones de administrador ya iniciadas.

Por tanto, no se afirma que no existan funciones en el servicio remoto; se afirma que no hay una función de IA localmente documentada, autorizada y verificable con la configuración accesible. No se llamó a endpoints supuestos ni se usaron tokens de usuario como claves de proveedor.

## Costo y decisión

La [documentación de Lovable AI](https://docs.lovable.dev/features/ai) permite usar su conector sin claves propias, pero cada solicitud consume créditos. Se aplica primero el cupo mensual de IA y después créditos generales donde estén disponibles. Los [cupos incluidos](https://docs.lovable.dev/introduction/credits-and-usage) son limitados y están sujetos a cambios; no prueban que esta cuenta tenga saldo ni que una petición esté cubierta sin gasto.

Falta verificar desde un acceso administrativo ya autorizado: una ruta de IA desplegada con su contrato, que acepte la sesión del propietario, las capacidades reales de ese servicio y la cobertura gratuita sin pasar a saldo de pago. No se pide introducir una nueva clave para resolverlo.

No se habilita una integración de costo desconocido. Quedan operativos los controles del navegador, las vistas previas, la extracción local y los contratos de envío existentes. La revisión y confirmación de operaciones sigue en `InputReviewDialog`; las escrituras conservan RLS y las RPC de ventas/compras.

Referencias: [listar funciones requiere permisos de administración](https://supabase.com/docs/reference/api/v1-list-all-functions), [claves de Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
