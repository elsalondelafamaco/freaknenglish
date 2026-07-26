# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json bun.lock* package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN npm install --legacy-peer-deps

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate

# Clean, non-incremental build. Then PROVE the compiled entrypoint contains the
# current source (the string only exists in the latest main.ts). If this grep
# finds 0 matches the build FAILS loudly instead of shipping a stale bundle.
RUN rm -rf dist tsconfig.tsbuildinfo \
 && npm run build \
 && echo "### COMPILED-ENTRY-CHECK ###" \
 && ls -la dist/src/main.js \
 && grep -c "BOOT_TRACE_MARKER_V1" dist/src/main.js

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Contenido de aprendizaje (index.json + HTML). ContentSyncService lo lee al
# arrancar para sembrar módulos y lecciones: sin esta copia, producción queda
# SIN contenido. Se verifica abajo para que el build falle en vez de desplegar
# una imagen muda.
COPY content ./content

RUN test -f content/index.json \
 && echo "### CONTENT-CHECK ### módulos:" \
 && node -e "const m=require('./content/index.json').modules;const l=m.reduce((s,x)=>s+x.lessons.length,0);if(!m.length)throw new Error('index.json sin módulos');console.log(m.length,'módulos /',l,'lecciones')"

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# Single source of truth for startup. Self-contained: sync schema then boot.
CMD ["sh", "-c", "echo '### CMD_START ###'; npx prisma db push --skip-generate && echo '### DBPUSH_OK -> starting node ###' && node dist/src/main.js"]
