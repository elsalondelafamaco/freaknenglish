/**
 * Prepara el HTML de una lección antes de montarlo en el iframe.
 *
 * Las lecciones traen `<script src="https://cdn.tailwindcss.com">`. Ese CDN a
 * veces no carga (red corporativa, DNS, o simplemente lento): la lección tarda
 * muchísimo y, cuando el script no llega, los slides se rompen porque pierden
 * TODO su CSS. Se reemplaza por una copia servida desde nuestro propio dominio.
 *
 * Se hace al renderizar y NO editando los HTML: así funciona igual para el
 * contenido que ya existe y para cualquier lección futura que use el CDN.
 * El iframe usa `srcDoc`, cuyo documento no tiene URL base, por eso la ruta
 * debe ser absoluta.
 *
 * Vive aquí (y no dentro de una ruta) porque lo usan tanto el visor del
 * estudiante como el del profesor; si se duplicara, el del profe cargaría el
 * CDN de terceros y vería los slides rotos.
 */
export function prepararHtmlLeccion(html: string, slideInicial = 0): string {
  if (!html) return html;
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  const conTailwind = html.replaceAll(
    "https://cdn.tailwindcss.com",
    `${origen}/vendor/tailwind-cdn.js`,
  );

  // Retomar la clase donde quedó. Se inyecta como variable ANTES del script de
  // la lección —y no por postMessage— para que `currentSlide` ya arranque en el
  // valor correcto: por mensaje habría un parpadeo del slide 1 y una carrera
  // con el `onload` de la lección.
  const n = Math.max(0, Math.floor(Number(slideInicial) || 0));
  if (n === 0) return conTailwind;
  const marca = `<script>window.__freaknSlideInicial=${n};</script>`;
  return conTailwind.includes("</head>")
    ? conTailwind.replace("</head>", `${marca}</head>`)
    : marca + conTailwind;
}

/** URL del recurso de una lección (video, slides, pdf o descarga). */
export function urlDeMedios(l: {
  videoUrl?: string | null;
  slidesUrl?: string | null;
  pdfUrl?: string | null;
  url?: string | null;
}): string {
  return l.videoUrl || l.slidesUrl || l.pdfUrl || l.url || "";
}
