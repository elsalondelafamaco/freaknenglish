import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { getAccessToken } from "@/lib/api/client";
import { boardsApi } from "@/lib/api/endpoints";

const API_URL: string =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3000/api/v1";

function socketOrigin() {
  // API_URL is like http(s)://host[:port]/api/v1 → strip path
  try {
    const u = new URL(API_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

let sharedSocket: Socket | null = null;
function getSocket(): Socket {
  const token = getAccessToken();
  if (sharedSocket && sharedSocket.connected) return sharedSocket;
  if (sharedSocket) {
    sharedSocket.auth = { token } as any;
    sharedSocket.connect();
    return sharedSocket;
  }
  sharedSocket = io(`${socketOrigin()}/board`, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: true,
  });
  return sharedSocket;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Tope de un update Yjs suelto — el mismo que aplica el backend
 * (MAX_UPDATE_BYTES en board.service.ts). Si se cambia allá, cambiarlo acá.
 */
const MAX_UPDATE_BYTES = 2 * 1024 * 1024;

export type EstadoGuardado = {
  /** Cambios que todavía no confirmó el servidor. 0 = todo a salvo. */
  pendientes: number;
  /** Fallo que no se arregla reintentando; hay que avisarle a quien escribe. */
  error: { tipo: "demasiado_grande" | "rechazado"; mensaje: string } | null;
};

export interface BoardPageProvider {
  doc: Y.Doc;
  awareness: Awareness;
  status: "connecting" | "connected" | "offline";
  destroy(): void;
  onStatus(cb: (s: BoardPageProvider["status"]) => void): () => void;
  onPresence(cb: (users: Array<{ id: string; email?: string; role?: string }>) => void): () => void;
  onSave(cb: (e: EstadoGuardado) => void): () => void;
}

export function createPageProvider(pageId: string, user: { id: string; name: string; color: string }): BoardPageProvider {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalStateField("user", { name: user.name, color: user.color, id: user.id });

  const socket = getSocket();
  let status: BoardPageProvider["status"] = "connecting";
  const statusListeners = new Set<(s: BoardPageProvider["status"]) => void>();
  const presenceListeners = new Set<(u: any[]) => void>();
  const saveListeners = new Set<(e: EstadoGuardado) => void>();
  const setStatus = (s: BoardPageProvider["status"]) => {
    status = s;
    statusListeners.forEach((cb) => cb(s));
  };

  let localLastSeq = 0;
  let joined = false;
  const seenClientOpIds = new Set<string>();

  async function bootstrap() {
    // Prefer snapshot from REST; then socket join for live ops
    try {
      const st = await boardsApi.pageState(pageId);
      if (st.snapshot) Y.applyUpdate(doc, b64ToBytes(st.snapshot), "server");
      localLastSeq = st.lastSeq;
      if (st.lastSeq > 0) {
        const ops = await boardsApi.pageOpsSince(pageId, 0);
        for (const op of ops) {
          if (op.seq <= 0) continue;
          seenClientOpIds.add(op.clientOpId);
          Y.applyUpdate(doc, b64ToBytes(op.update), "server");
          localLastSeq = Math.max(localLastSeq, op.seq);
        }
      }
    } catch (e) {
      // ignore; may still work via socket
    }
    joinRoom();
  }

  function joinRoom() {
    if (!socket.connected) {
      socket.once("connect", () => joinRoom());
      return;
    }
    socket.emit("page:join", { pageId }, (_ack: any) => {
      joined = true;
      setStatus("connected");
    });
  }

  // Wire socket → local doc
  const onUpdate = (payload: { seq: number; clientOpId: string; update: string }) => {
    if (seenClientOpIds.has(payload.clientOpId)) return;
    seenClientOpIds.add(payload.clientOpId);
    Y.applyUpdate(doc, b64ToBytes(payload.update), "server");
    localLastSeq = Math.max(localLastSeq, payload.seq);
  };
  const onAwareness = (payload: { userId: string; update: string }) => {
    applyAwarenessUpdate(awareness, b64ToBytes(payload.update), "remote");
  };
  const onPresence = (payload: { users: any[] }) => {
    presenceListeners.forEach((cb) => cb(payload.users ?? []));
  };
  const onConnect = () => {
    setStatus("connected");
    if (joined) joinRoom(); // rejoin after reconnect
  };
  const onDisconnect = () => setStatus("offline");

  socket.on("page:update", onUpdate);
  socket.on("page:awareness", onAwareness);
  socket.on("page:presence", onPresence);
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);

  // Local doc → servidor. El socket es el camino rápido; si no está conectado
  // o no confirma (ack) en 3 s, se persiste por REST (idempotente por
  // clientOpId) — el contenido NUNCA se queda solo en memoria.
  //
  // Antes, si el REST también fallaba, quedaba UN reintento a los 4 s y después
  // silencio: el cambio se perdía y nadie se enteraba. El profe seguía viendo
  // su texto (vive en el Y.Doc del navegador) y lo perdía al cambiar de página.
  // Ahora se reintenta con espera creciente hasta que entre, y lo único que se
  // da por perdido —un update por encima del tope del servidor— se avisa.
  const sinConfirmar = new Set<string>();
  let errorDeGuardado: EstadoGuardado["error"] = null;
  const avisarGuardado = () => {
    const e: EstadoGuardado = { pendientes: sinConfirmar.size, error: errorDeGuardado };
    saveListeners.forEach((cb) => cb(e));
  };
  const confirmado = (clientOpId: string) => {
    sinConfirmar.delete(clientOpId);
    avisarGuardado();
  };

  const persistViaRest = (updateB64: string, clientOpId: string, intento = 0) => {
    boardsApi
      .appendPageOp(pageId, updateB64, clientOpId)
      .then(() => confirmado(clientOpId))
      .catch((e: any) => {
        // 400 = el servidor no lo va a aceptar por más que insistamos.
        if (e?.status === 400) {
          sinConfirmar.delete(clientOpId);
          errorDeGuardado = {
            tipo: e?.code === "update_too_large" ? "demasiado_grande" : "rechazado",
            mensaje: e?.message ?? "El servidor rechazó el cambio.",
          };
          avisarGuardado();
          return;
        }
        // Corte de red, 500, servidor reiniciando: 2 s, 4 s, 8 s… hasta 1 min.
        setTimeout(() => persistViaRest(updateB64, clientOpId, intento + 1), Math.min(60_000, 2000 * 2 ** intento));
      });
  };

  const docUpdateHandler = (update: Uint8Array, origin: any) => {
    if (origin === "server") return;
    const clientOpId = crypto.randomUUID();
    seenClientOpIds.add(clientOpId);
    if (update.byteLength > MAX_UPDATE_BYTES) {
      // Ni lo intentamos: lo importante es que quien está escribiendo lo sepa
      // ahora y no cuando cambie de página y ya no esté.
      errorDeGuardado = {
        tipo: "demasiado_grande",
        mensaje: `Ese contenido pesa ${Math.round(update.byteLength / 1024)} KB de una sola vez y el máximo por cambio es ${Math.round(MAX_UPDATE_BYTES / 1024)} KB. Pégalo en partes.`,
      };
      avisarGuardado();
      return;
    }
    sinConfirmar.add(clientOpId);
    avisarGuardado();
    const updateB64 = bytesToB64(update);
    if (socket.connected) {
      let acked = false;
      socket.timeout(3000).emit("page:update", { pageId, update: updateB64, clientOpId }, (err: any, res: any) => {
        acked = true;
        if (!err && res?.ok) return confirmado(clientOpId);
        persistViaRest(updateB64, clientOpId);
      });
      setTimeout(() => { if (!acked) persistViaRest(updateB64, clientOpId); }, 3500);
    } else {
      persistViaRest(updateB64, clientOpId);
    }
  };
  doc.on("update", docUpdateHandler);

  const awarenessHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
  ) => {
    const changed = added.concat(updated).concat(removed);
    const update = encodeAwarenessUpdate(awareness, changed);
    socket.emit("page:awareness", { pageId, update: bytesToB64(update) });
  };
  awareness.on("update", awarenessHandler);

  bootstrap();

  return {
    doc,
    awareness,
    get status() {
      return status;
    },
    onStatus(cb) {
      statusListeners.add(cb);
      cb(status);
      return () => statusListeners.delete(cb);
    },
    onPresence(cb) {
      presenceListeners.add(cb);
      return () => presenceListeners.delete(cb);
    },
    onSave(cb) {
      saveListeners.add(cb);
      cb({ pendientes: sinConfirmar.size, error: errorDeGuardado });
      return () => saveListeners.delete(cb);
    },
    destroy() {
      try {
        socket.emit("page:leave", { pageId });
      } catch {}
      socket.off("page:update", onUpdate);
      socket.off("page:awareness", onAwareness);
      socket.off("page:presence", onPresence);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      doc.off("update", docUpdateHandler);
      awareness.off("update", awarenessHandler);
      awareness.destroy();
      doc.destroy();
    },
  };
}

export function colorFor(id: string): string {
  const palette = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}