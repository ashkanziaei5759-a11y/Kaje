-- Menu photos move from the filesystem into Postgres so they survive on a
-- serverless host, where the filesystem is read-only and per-instance.
CREATE TABLE "StoredImage" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'image/webp',
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bytes" INTEGER NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredImage_restaurantId_hash_key" ON "StoredImage"("restaurantId", "hash");
CREATE INDEX "StoredImage_restaurantId_idx" ON "StoredImage"("restaurantId");

ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
