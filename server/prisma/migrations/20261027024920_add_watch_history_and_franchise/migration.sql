-- AlterTable
ALTER TABLE "animes" ADD COLUMN     "franchiseId" TEXT;

-- CreateTable
CREATE TABLE "watch_history" (
    "id" TEXT NOT NULL,
    "animeSlug" TEXT NOT NULL,
    "animeTitle" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "episodeNum" INTEGER NOT NULL,
    "episodeId" TEXT,
    "progressSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootSlug" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "franchises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchise_items" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "jkanimeSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "seasonNumber" INTEGER,
    "year" INTEGER,
    "episodes" INTEGER,
    "status" TEXT,
    "coverUrl" TEXT NOT NULL,
    "localCoverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "franchise_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watch_history_updatedAt_idx" ON "watch_history"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "watch_history_animeSlug_episodeNum_key" ON "watch_history"("animeSlug", "episodeNum");

-- CreateIndex
CREATE UNIQUE INDEX "franchises_name_key" ON "franchises"("name");

-- CreateIndex
CREATE UNIQUE INDEX "franchise_items_franchiseId_anilistId_key" ON "franchise_items"("franchiseId", "anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "franchise_items_franchiseId_jkanimeSlug_key" ON "franchise_items"("franchiseId", "jkanimeSlug");

-- AddForeignKey
ALTER TABLE "animes" ADD CONSTRAINT "animes_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_items" ADD CONSTRAINT "franchise_items_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
