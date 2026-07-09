-- Board pages + per-page Yjs op log
CREATE TABLE "board_pages" (
  "id" TEXT PRIMARY KEY,
  "board_id" TEXT NOT NULL REFERENCES "boards"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL DEFAULT 'Página',
  "position" INTEGER NOT NULL DEFAULT 0,
  "kind" TEXT NOT NULL DEFAULT 'doc',
  "yjs_state" BYTEA,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "board_pages_board_id_position_idx" ON "board_pages"("board_id","position");

CREATE TABLE "board_page_ops" (
  "id" TEXT PRIMARY KEY,
  "page_id" TEXT NOT NULL REFERENCES "board_pages"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL,
  "client_op_id" TEXT NOT NULL,
  "update" BYTEA NOT NULL,
  "seq" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "board_page_ops_page_seq_uk" ON "board_page_ops"("page_id","seq");
CREATE UNIQUE INDEX "board_page_ops_page_client_uk" ON "board_page_ops"("page_id","client_op_id");
CREATE INDEX "board_page_ops_page_created_idx" ON "board_page_ops"("page_id","created_at");