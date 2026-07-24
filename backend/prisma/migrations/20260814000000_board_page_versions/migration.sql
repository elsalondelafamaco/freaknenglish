CREATE TABLE "board_page_versions" (
  "id" TEXT PRIMARY KEY,
  "page_id" TEXT NOT NULL REFERENCES "board_pages"("id") ON DELETE CASCADE,
  "created_by" TEXT NOT NULL,
  "label" TEXT,
  "state" BYTEA NOT NULL,
  "size_bytes" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "board_page_versions_page_created_idx" ON "board_page_versions"("page_id","created_at");
