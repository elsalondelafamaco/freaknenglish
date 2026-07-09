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

export interface BoardPageProvider {
  doc: Y.Doc;
  awareness: Awareness;
  status: "connecting" | "connected" | "offline";
  destroy(): void;
  onStatus(cb: (s: BoardPageProvider["status"]) => void): () => void;
  onPresence(cb: (users: Array<{ id: string; email?: string; role?: string }>) => void): () => void;
}

export function createPageProvider(pageId: string, user: { id: string; name: string; color: string }): BoardPageProvider {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalStateField("user", { name: user.name, color: user.color, id: user.id });

  const socket = getSocket();
  let status: BoardPageProvider["status"] = "connecting";
  const statusListeners = new Set<(s: BoardPageProvider["status"]) => void>();
  const presenceListeners = new Set<(u: any[]) => void>();
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

  // Local doc → socket
  const docUpdateHandler = (update: Uint8Array, origin: any) => {
    if (origin === "server") return;
    const clientOpId = crypto.randomUUID();
    seenClientOpIds.add(clientOpId);
    socket.emit("page:update", { pageId, update: bytesToB64(update), clientOpId });
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