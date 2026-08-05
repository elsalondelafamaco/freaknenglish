/**
 * Contenido editable de la home con defaults QUEMADOS en el bundle.
 *
 * Estrategia anti-caída (la home nunca depende de la API):
 *   1. Defaults quemados: assets locales del bundle + textos por defecto.
 *   2. `useSiteContent()` consulta `GET /public/settings/site`; si responde,
 *      mezcla los overrides del admin (URLs estables de MinIO) sobre los
 *      defaults y los cachea en localStorage.
 *   3. Si la API falla, usa el último cache conocido; si no hay cache, los
 *      defaults del bundle. La home siempre pinta.
 *
 * Los overrides se administran en /admin/site (media, FAQs, legal, redes).
 */
import { useQuery } from "@tanstack/react-query";
import { settingsApi, type SiteContentOverrides, type SiteFaq } from "@/lib/api/endpoints";
import heroStudent from "@/assets/hero-student.jpg";
import teacherAvatar from "@/assets/avatar-teacher.jpg";
import how1 from "@/assets/how-1-schedule.jpg";
import how2 from "@/assets/how-2-classes.jpg";
import how3 from "@/assets/how-3-confidence.jpg";
import t1 from "@/assets/testimonial-1.jpg";
import t2 from "@/assets/testimonial-2.jpg";
import t3 from "@/assets/testimonial-3.jpg";
import t4 from "@/assets/testimonial-4.jpg";

/** Slots de media de la home. El id es también la clave estable en MinIO (site/<id>). */
export const MEDIA_SLOTS = [
  { id: "hero-image", kind: "image", label: "Hero · Foto principal", where: "Sección superior, foto grande de la estudiante." },
  { id: "how-1-image", kind: "image", label: "Cómo funciona · Paso 1 (imagen)", where: "Card 'Escoge tu horario'." },
  { id: "how-1-video", kind: "video", label: "Cómo funciona · Paso 1 (video)", where: "Se reproduce al tocar el play de la card 'Escoge tu horario'. Sin video, el play no se muestra." },
  { id: "how-2-image", kind: "image", label: "Cómo funciona · Paso 2 (imagen)", where: "Card 'Empieza tus clases'." },
  { id: "how-2-video", kind: "video", label: "Cómo funciona · Paso 2 (video)", where: "Play de la card 'Empieza tus clases'. Sin video, el play no se muestra." },
  { id: "how-3-image", kind: "image", label: "Cómo funciona · Paso 3 (imagen)", where: "Card 'Habla con confianza'." },
  { id: "how-3-video", kind: "video", label: "Cómo funciona · Paso 3 (video)", where: "Play de la card 'Habla con confianza'. Sin video, el play no se muestra." },
  { id: "testimonial-1-image", kind: "image", label: "Testimonio 1 · Foto (Carlos M.)", where: "Primera card del carrusel de testimonios." },
  { id: "testimonial-1-video", kind: "video", label: "Testimonio 1 · Video", where: "Play sobre la foto del testimonio 1. Sin video, el play no se muestra." },
  { id: "testimonial-2-image", kind: "image", label: "Testimonio 2 · Foto (Valentina R.)", where: "Segunda card del carrusel." },
  { id: "testimonial-2-video", kind: "video", label: "Testimonio 2 · Video", where: "Play sobre la foto del testimonio 2." },
  { id: "testimonial-3-image", kind: "image", label: "Testimonio 3 · Foto (Andrés T.)", where: "Tercera card del carrusel." },
  { id: "testimonial-3-video", kind: "video", label: "Testimonio 3 · Video", where: "Play sobre la foto del testimonio 3." },
  { id: "testimonial-4-image", kind: "image", label: "Testimonio 4 · Foto (Mariana G.)", where: "Cuarta card del carrusel." },
  { id: "testimonial-4-video", kind: "video", label: "Testimonio 4 · Video", where: "Play sobre la foto del testimonio 4." },
  { id: "avatar-teacher", kind: "image", label: "Hero · Avatar del teacher", where: "Carita circular en la tarjeta 'Teacher: Great job!' del hero." },
  { id: "sphere-1", kind: "image", label: "Esferita 1 (estudiante)", where: "Primera bolita: barra '+2000 Estudiantes' y tarjeta 'Clase en Vivo' del hero. Sin imagen se ve una esfera de color." },
  { id: "sphere-2", kind: "image", label: "Esferita 2 (estudiante)", where: "Segunda bolita de la barra de estudiantes y del hero." },
  { id: "sphere-3", kind: "image", label: "Esferita 3 (estudiante)", where: "Tercera bolita de la barra de estudiantes y del hero." },
  { id: "sphere-4", kind: "image", label: "Esferita 4 (estudiante)", where: "Cuarta bolita de la barra '+2000 Estudiantes'." },
] as const;

export type MediaSlotId = (typeof MEDIA_SLOTS)[number]["id"];

/** Imágenes por defecto (bundle local — funcionan sin API ni MinIO). */
const DEFAULT_MEDIA: Record<string, string> = {
  "hero-image": heroStudent,
  "how-1-image": how1,
  "how-2-image": how2,
  "how-3-image": how3,
  "testimonial-1-image": t1,
  "testimonial-2-image": t2,
  "testimonial-3-image": t3,
  "testimonial-4-image": t4,
  "avatar-teacher": teacherAvatar,
  // sphere-1..4 sin default: sin imagen se pinta una esfera de color.
  // Los slots de video no tienen default: sin URL el botón play se oculta.
};

export const DEFAULT_FAQS: SiteFaq[] = [
  {
    q: "¿Por qué son horarios fijos?",
    a: "Al ser clases One on One, las agendas de nuestros profes están divididas en bloques continuos de 50 minutos con diferentes estudiantes a lo largo del día. Tener un horario fijo nos permite organizar estas agendas a la perfección para que tu profe siempre esté puntual y con tu clase preparada, sin tiempos de espera.",
  },
  {
    q: "¿Necesito experiencia previa en inglés?",
    a: "¡Para nada! Puedes arrancar desde cero absoluto con nosotros. Ahora, si ya tienes algunas bases previas, tampoco te estreses con exámenes de nivel. Tu primer día tendrás una charla súper relajada con tu teacher; a través de esa conversación sabremos exactamente qué temas dominas y desde qué punto arrancar para que le saques el jugo a tus clases.",
  },
  {
    q: "¿Las clases son en vivo o grabadas?",
    a: "¡100% en vivo! En nuestro programa One on One no usamos clases pregrabadas. Durante los 50 minutos que dura tu sesión, tendrás a tu teacher conectado en tiempo real, dedicado exclusivamente a ti, para conversar, corregirte y guiar tu proceso siempre.",
  },
  {
    q: "¿Qué necesito para empezar?",
    a: "Solo necesitas leer y aceptar nuestras políticas, hacer tu registro y eso es todo. No tenemos cláusulas de permanencia, tú decides cuándo parar.",
  },
];

export const DEFAULT_SOCIAL = {
  instagram: "https://www.instagram.com/freaknenglish/",
  facebook: "https://www.facebook.com/freaknenglish",
};

/** Documentos legales: sin URL configurada el link no se muestra en el footer. */
export const DEFAULT_LEGAL: { privacy?: string; terms?: string } = {};

export type SiteContent = {
  media: Record<string, string>;
  faqs: SiteFaq[];
  legal: { privacy?: string; terms?: string };
  social: { instagram?: string; facebook?: string };
  /** slot de imagen → nombre y rol del testimonio, editables desde el admin. */
  testimonials: Record<string, { name?: string; role?: string }>;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  media: DEFAULT_MEDIA,
  faqs: DEFAULT_FAQS,
  legal: DEFAULT_LEGAL,
  social: DEFAULT_SOCIAL,
  testimonials: {},
};

const CACHE_KEY = "freakn.siteContent.v1";

function readCache(): SiteContentOverrides | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SiteContentOverrides) : null;
  } catch {
    return null;
  }
}

function writeCache(v: SiteContentOverrides) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(v));
  } catch {
    /* storage lleno/privado: seguimos con defaults */
  }
}

/**
 * URL ESTABLE de un slot de media: siempre la misma, servida por nuestro
 * backend, que redirige al objeto actual en MinIO. Al subir una imagen desde
 * el admin se reemplaza el objeto detrás y el `<img src>` de la home no
 * cambia, así que no hay parpadeo ni swap de URL a mitad de carga.
 * Si el slot no tiene imagen, el backend responde 404 y el `onError` del
 * componente cae a la imagen del bundle.
 */
export function mediaUrl(slot: MediaSlotId | string): string {
  const base = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3000/api/v1";
  return `${base}/public/settings/media/${slot}`;
}

/** Imagen del bundle para un slot (respaldo cuando la remota falla). */
export function mediaFallback(slot: MediaSlotId | string): string | undefined {
  return DEFAULT_MEDIA[slot];
}

export function mergeSiteContent(overrides: SiteContentOverrides | null | undefined): SiteContent {
  if (!overrides) return DEFAULT_SITE_CONTENT;
  return {
    media: { ...DEFAULT_MEDIA, ...(overrides.media ?? {}) },
    faqs: overrides.faqs?.length ? overrides.faqs : DEFAULT_FAQS,
    legal: { ...DEFAULT_LEGAL, ...(overrides.legal ?? {}) },
    social: { ...DEFAULT_SOCIAL, ...(overrides.social ?? {}) },
    testimonials: overrides.testimonials ?? {},
  };
}

/**
 * Contenido de la home listo para pintar. Nunca lanza ni bloquea: mientras
 * carga (o si la API falla) devuelve defaults/último cache.
 */
export function useSiteContent(): SiteContent {
  const q = useQuery({
    queryKey: ["site-content"],
    queryFn: async () => {
      const data = await settingsApi.site();
      writeCache(data);
      return data;
    },
    staleTime: 5 * 60_000,
    retry: 1,
    placeholderData: () => readCache() ?? undefined,
  });
  return mergeSiteContent(q.data ?? readCache());
}
