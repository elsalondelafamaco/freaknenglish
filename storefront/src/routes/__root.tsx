import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { LanguageProvider } from "../lib/i18n";
import { registerPwa } from "../lib/pwa/register";
import { THEME_BOOT_SCRIPT } from "../lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cream px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-ink/60">
          Esta página no existe
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-ink sm:text-4xl">
          No encontramos lo que buscas
        </h1>
        <p className="mt-3 text-[15px] text-brand-ink/70">
          Puede que el enlace haya cambiado o ya no esté disponible.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-cream px-5 py-14">
      <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft">
        <img src="/logo-freakn.svg" alt="FreaknEnglish" className="mx-auto h-8 w-auto" />
        <div className="mx-auto mt-6 flex size-14 items-center justify-center rounded-full bg-red-50 text-2xl">😕</div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-brand-ink">Algo se rompió</h1>
        <p className="mt-2 text-[15px] text-brand-ink/65">
          Tuvimos un problema al cargar esta parte de la app. Puedes reintentar o volver al inicio;
          tus datos están a salvo.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-brand-ink/20 bg-white px-6 text-sm font-semibold text-brand-ink transition hover:bg-brand-cream/40"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </main>
  );
}

const SITE_URL = "https://interface-joy-flow.lovable.app";

const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "FreaknEnglish",
  url: SITE_URL,
  logo: `${SITE_URL}/apple-touch-icon.png`,
  description:
    "Clases 1 a 1 en vivo de inglés con profesores reales. Plataforma para hablar inglés con confianza desde el día 1.",
  sameAs: [],
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "FreaknEnglish — Habla inglés con confianza, 1 a 1 en vivo" },
      { name: "description", content: "Clases 1 a 1 en vivo con profesores reales. Conversaciones prácticas y feedback personalizado para que hables inglés con fluidez desde el día 1." },
      { name: "author", content: "FreaknEnglish" },
      { property: "og:title", content: "FreaknEnglish — Habla inglés con confianza" },
      { property: "og:description", content: "Clases 1 a 1 en vivo con profesores reales. Habla, no traduzcas." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "FreaknEnglish" },
      { property: "og:locale", content: "es_CO" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@FreaknEnglish" },
      { name: "theme-color", content: "#FBE34B" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Freakn" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "canonical", href: SITE_URL },
    ],
    scripts: [
      // Aplica el tema (dark/claro) ANTES del primer paint para evitar flash.
      { children: THEME_BOOT_SCRIPT },
      {
        type: "application/ld+json",
        children: JSON.stringify(ORGANIZATION_JSONLD),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => { void registerPwa(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
