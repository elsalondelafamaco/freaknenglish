import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Un pedido de /assets/… que llega hasta acá es un archivo que YA NO EXISTE: los
 * que existen los sirve Nitro antes, con su cabecera de caché eterna.
 *
 * Antes caía en el renderizador y devolvía la página HTML de "no encontrado"
 * con la cabecera de /assets/** pegada: el navegador se guardaba esa respuesta
 * y, cada vez que una pestaña vieja pedía su trozo de código tras un despliegue,
 * recibía HTML donde esperaba JavaScript. De ahí el "Algo se rompió" que no se
 * iba ni recargando. Ahora es un 404 pelado y sin caché: el siguiente intento
 * vuelve a preguntar.
 */
function esPedidoDeArchivoEstatico(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname.startsWith("/assets/") || pathname.startsWith("/_build/");
}

/**
 * El HTML no se cachea nunca sin preguntar: es el que nombra los trozos de
 * código de la versión actual. Servido de una copia vieja, pide archivos que ya
 * no están. `no-cache` no prohíbe guardarlo, obliga a revalidarlo.
 */
function conCabecerasDeHtml(response: Response) {
  const tipo = response.headers.get("content-type") ?? "";
  if (!tipo.includes("text/html") || response.headers.has("cache-control")) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (esPedidoDeArchivoEstatico(request)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return conCabecerasDeHtml(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
