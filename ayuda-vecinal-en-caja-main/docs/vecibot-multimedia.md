# VeciBot: voz y adjuntos sin nuevas claves

La aplicación usa el servidor de TanStack Start en el mismo origen del navegador. No necesita Express ni un puerto adicional para VeciBot. Inicia `npm.cmd run dev` desde la carpeta que contiene `package.json`, no desde la carpeta exterior del ZIP. Usa la dirección que imprime Vite; abrir archivos directamente no ejecuta la API.

## Qué permite la configuración existente

Se conservaron las variables de Supabase de `.env`. Su servicio de autenticación respondió HTTP 200 durante la revisión. Esto comprueba disponibilidad del servicio, no una sesión de propietario ni autorización para leer su tienda. No se agregaron credenciales.

| Función | Disponible sin nuevas claves ni pagos |
| --- | --- |
| Cuenta, tienda y operaciones manuales | Mediante la conexión existente de Supabase y la sesión del propietario; se conserva RLS. |
| Escuchar saludo y mensajes existentes | Sí, si el navegador ofrece voces españolas. |
| Activación «Hola VeciBot» y dictado | Sí, si existe SpeechRecognition, hay permiso de micrófono y funciona el servicio del navegador. Puede requerir Internet. |
| Envío de la transcripción tras silencio | Se envía tras unos 2 segundos, solo con palabras confirmadas. La recepción del mensaje no depende de la IA. |
| Enviar texto, fotos, documentos, audio y video | Sí, con o sin texto. Requiere la sesión del propietario; el servidor valida los bytes y confirma el mensaje en el historial. |
| Adjuntar, quitar y previsualizar archivos | Sí. Los originales se conservan en este navegador; los nombres, tamaños y huellas se guardan con el mensaje. |
| Extraer texto | Localmente de PDF con texto seleccionable, DOCX y TXT/CSV/MD/JSON en UTF-8. No es un análisis de IA. |
| Generar PDF de una respuesta existente | Sí, con el botón Descargar PDF. |
| Nuevas respuestas de IA o interpretación de operaciones | No con la configuración actual. Supabase no es un modelo de IA. |
| Comprender imágenes, transcribir adjuntos de audio o analizar videos | No con la configuración actual. Vista previa y reproducción no equivalen a comprender su contenido. |

No se instalaron modelos locales. La descarga de Ollama se canceló por solicitud del usuario: se eliminó su único ZIP incompleto (338.441.837 bytes) y el script de preparación. No se modifica `.env` ni se activa un proveedor alternativo automáticamente.

## Conversación por voz

1. Entra en VeciBot y pulsa **Activar conversación**. Solo esta acción solicita el micrófono.
2. Permite el micrófono y di **Hola VeciBot** o **VeciBot**. El saludo fijo de activación es «Dígame, veci, ¿en qué puedo ayudarte?». Es un control de la interfaz, no una respuesta generada por IA.
3. Dicta una consulta; las palabras aparecen en el cuadro. Tras aproximadamente 2 segundos sin nuevos resultados se envía al historial. Si quedan palabras provisionales, se pide al navegador un resultado final; si no lo confirma, se conserva el texto para revisión y se apaga el micrófono. Un fallo de envío conserva los archivos y la transcripción para reintentar.
4. La captura se aborta antes de reproducir voz o procesar una consulta. Se reanuda después de terminar, con una pausa de 500 ms. No se inicia otra consulta mientras haya una en curso. El saludo se pronuncia una vez por activación; repetir la palabra de activación no lo convierte en una nueva respuesta. Sin IA, se lee una sola vez por activación un aviso de servicio no habilitado, identificado como estado del envío; no es una respuesta a la consulta. Los mensajes siguientes se pueden seguir dictando y enviando.
5. **Silenciar voz** desactiva la lectura automática; **Detener respuesta** interrumpe lectura/generación; **Desactivar micrófono** cancela reconocimiento y temporizadores. Cambiar de pestaña, ocultar la página o salir también apaga el reconocimiento.

Se solicita `es-EC` para dictado. Para lectura se prefieren nombres conocidos de voces masculinas; entre ellas, primero `es-EC`, después `es-CO`, español latinoamericano y otras voces españolas. Si no hay una masculina identificable, se elige la voz española más cercana y se informa de la limitación. La API no expone el género: la preferencia se basa en el nombre, y el selector **Voz del navegador** permite elegir otra. La velocidad es 0,95 y el tono 0,96; estos ajustes no crean una voz masculina ni un acento que el equipo no tenga.

El reconocimiento del navegador puede enviar audio al servicio de su fabricante. No se descarga un paquete de reconocimiento local, no se cambia a transcripción de pago y no se solicita permiso al abrir VeciBot. HTTPS o localhost son necesarios. Si no hay soporte o permiso se conserva la entrada por texto.

## Archivos

**Foto**, **Subir**, pegar y arrastrar permiten adjuntar hasta 5 archivos: 5 MB por archivo, 15 MB en total. Se conserva el texto escrito junto a ellos.

Formatos: JPG/JPEG, PNG, WebP, PDF; TXT, CSV, MD, JSON, DOCX, DOC, RTF; audio MP3, WAV, Ogg, M4A y videos MP4, WebM, MOV. HEIC, SVG y otros formatos muestran un aviso. Los reproductores dependen de los códecs disponibles en el navegador.

Cada archivo tiene **Quitar** y **Extraer texto / ver estado**. Fotos tienen miniatura; audios y videos, controles; PDFs, un enlace de vista previa. Reproducir un adjunto desactiva el micrófono para que no lo dicte. Las URLs temporales se liberan al quitar el archivo o salir. Un envío fallido conserva el texto y los adjuntos, sin presentar el fallo a la vez en el panel y en notificaciones emergentes.

Al pulsar **Enviar**, la burbuja aparece con sus adjuntos y el estado **Enviando…**. Solo cambia a **Mensaje recibido** cuando el servidor confirma el guardado. Si falla o se cancela, se muestra **Recepción no confirmada** y se conserva el borrador. Reintentar el mismo contenido utiliza el mismo UUID: una respuesta perdida no duplica el mensaje. El servidor compara también la huella SHA-256 de los archivos.

Los originales se guardan en IndexedDB, separados por tienda y mensaje, para recuperarlos al recargar en este navegador. No se crea un bucket público ni se guardan bytes de archivos en `chat_messages`. En otro equipo siguen visibles el texto y los nombres, con un aviso de que los originales están en el navegador de origen. Si falta espacio o IndexedDB no está disponible, se avisa y se conservan los archivos en la pestaña actual. Limpiar el historial requiere la confirmación existente y borra los adjuntos locales de esa tienda.

La extracción usa PDF.js y fflate, sin modelos ni servicios externos:

- PDF: hasta 30 páginas y 16.000 caracteres; solo texto seleccionable. Un PDF escaneado se marca sin texto, sin afirmar que se aplicó OCR.
- DOCX: texto del cuerpo principal; XML descomprimido limitado a 2 MB. No comprende imágenes ni recupera la estructura completa de tablas.
- Texto UTF-8: se lee el inicio (hasta 64 KB) y se muestran hasta 16.000 caracteres. Se informa si se truncó.
- DOC antiguo, RTF, imágenes, audio y video: se pueden adjuntar; se informa que no se extrajo ni comprendió su contenido.

Se renderiza texto, nunca el HTML/XML del documento. Archivos cifrados, dañados o no compatibles muestran un error. Los originales y textos extraídos no se guardan en Supabase mediante esta función.

## Servidor y contratos conservados

- `GET /api/vecibot`: estado del servidor y si el proveedor está configurado; no expone claves. Configurado no significa conectividad con el proveedor comprobada.
- `POST /api/vecibot-mensajes`: recepción sin IA. Acepta `multipart/form-data` con `id` UUID, `text` opcional y campos `files`, o JSON equivalente con archivos Base64. Verifica sesión, tienda, tamaños, formatos y huellas; guarda texto y metadatos en la tabla existente mediante el JWT del propietario. Devuelve un recibo JSON, nunca una respuesta generada. No necesita una migración ni credenciales nuevas.
- `POST /api/vecibot`: mantiene autenticación del propietario, contexto BI en servidor, RLS y persistencia de texto en `chat_messages`. Sin IA devuelve 503 con el motivo real; no genera respuestas de sustitución.
- `POST /api/vecibot-entrada`: interpretación de consultas y borradores; requiere IA. El guardado sigue necesitando revisión y confirmación.
- `POST /api/vecibot-acciones`: conserva la RPC `apply_vecibot_action`, aislamiento por tienda y reintentos mediante UUID. Ventas/compras siguen pasando por las funciones de la base.
- `POST /api/vecibot-transcribir`: opción del servidor ya existente; requiere IA y no se usa como respaldo del dictado del navegador.

No hay un proveedor de IA habilitado. Las rutas que requieren generación o transcripción en el servidor responden con una limitación explícita, sin pedir claves ni activar servicios. La voz del navegador y la extracción local de archivos siguen disponibles. La carga de archivos no habilita por sí misma la IA.

## Verificación

`npm.cmd test`, `node_modules/.bin/tsc.cmd --noEmit` y `npm.cmd run build` comprueban la suite, los tipos y la compilación. Las pruebas del reconocimiento usan una API simulada para comprobar el flujo; no demuestran que el micrófono físico o el servicio de dictado estén disponibles.

La prueba de recepción usa HTTP y multipart reales con una imagen PNG del proyecto; la identidad y la base de datos se simulan para no escribir datos reales de una cuenta. La prueba de interfaz utiliza el estado real del chat, envía texto y una foto, comprueba la miniatura y el recibo, y prueba el reintento sin duplicados; su servidor y almacenamiento local son simulados. Una sesión autenticada real y la persistencia de IndexedDB del navegador requieren comprobación manual.

Prueba manual en Chrome/Edge: iniciar sesión, activar conversación, permitir micrófono, decir el saludo, escuchar, dictar una consulta, esperar dos segundos y comprobar que la ausencia de IA se comunica sin inventar una respuesta. Probar silenciar/detener/desactivar y comprobar que el navegador deja de capturar. Adjuntar una foto, PDF, DOCX, audio y video, revisar sus vistas previas, extraer texto y quitar archivos. Sin proveedor no es posible verificar una respuesta real de IA.

Referencias: [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [PDF.js](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
