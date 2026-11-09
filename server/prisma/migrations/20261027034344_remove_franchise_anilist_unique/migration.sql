-- DropIndex
DROP INDEX "franchise_items_franchiseId_anilistId_key";

-- AlterTable
ALTER TABLE "franchise_items" ALTER COLUMN "anilistId" DROP NOT NULL;
