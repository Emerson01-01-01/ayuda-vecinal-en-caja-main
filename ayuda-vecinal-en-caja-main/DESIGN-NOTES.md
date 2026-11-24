# Recursos de la pantalla principal

- Foto local: `src/assets/hero-quito.jpg` (1500 × 1125).
- Fuente: https://blog.properati.com.ec/guia-de-ciudades/quito/
- Imagen principal declarada por la página: https://blog.properati.com.ec/wp-content/uploads/2022/12/quito-guia-ciudad-properati.jpg
- Logo local: `public/brand/ayudate-veci-cuy.png` (1328 × 1184), usado también como favicon de inicio.
- Original del logo: `Gemini_Generated_Image.jpeg`, adjuntado por el usuario; se conserva intacto.
- Edición del logo: herramienta integrada Imagegen, sin API ni CLI adicional.

## Prompt utilizado para el logo

Use case: text-localization. Edit target: the attached existing Ecuadorian guinea-pig logo. This is a surgical brand correction, not a redesign. Change only the large text from AYUDATE VECI to AYÚDATE VECI, adding the acute accent above the U and keeping the space between words. Preserve exactly the guinea pig, glasses, poncho, mountain, church, tablet, navy outlines, colors, proportions and serif lettering style. Preserve the tagline verbatim: INTELIGENCIA DE NEGOCIOS VECINAL. Keep the original cream/white details inside the logo; remove only the large cream outer rectangular background to actual transparency. Frame the complete logo closely with a modest transparent margin, no clipping of outlines or accent. No other changes. Output intended for the website Ayúdate Veci.

## Alcance

El tema claro se aplica únicamente a la pantalla principal mediante `.welcome-page`: fondo, encabezado y pie blancos; títulos azul oscuro `#123C68`; textos secundarios `#34516F`; acciones principales rojas `#E52435`. Las tarjetas auxiliares usan fondos claros y bordes suaves, con sombras discretas. El marco de la fotografía es negro `#000000` y conserva sus bordes redondeados. Los textos sobre ese marco mantienen el contraste claro. Se conservan intactos los archivos del logo del cuy y de la fotografía, además de la distribución.

Se usa Poppins (600/700) para títulos e Inter (400/500/600/700) para textos y botones, con alternativas sans-serif. Las fuentes se cargan solo en la ruta principal. El título usa tamaños fluidos y permite saltos de línea sin recortes. El acceso «Iniciar sesión» permanece junto a «Crear cuenta»; se elimina su duplicado del encabezado.

La comunicación se dirige a las tiendas de todo Ecuador, incluidos los metadatos, el registro, la configuración, el menú y la presentación de VeciBot. Los campos de barrio siguen aceptando texto libre y muestran ejemplos generales. La tarjeta con la estimación local de mercado se sustituye por un mensaje nacional sin cifras. La etiqueta «Quito, Ecuador» identifica únicamente la fotografía.

El nombre visible es «AyúdateVeci», con tilde y sin espacio, también en metadatos y mensajes. El encabezado muestra «Ayúdate» azul oscuro y «Veci» rojo para mantener su legibilidad sobre blanco. El archivo del logo del cuy se conserva intacto. No se modifican los flujos de autenticación, las funciones de negocio, la zona horaria configurada ni los datos existentes.
