-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('HTTP', 'PORT');

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "port" INTEGER,
ADD COLUMN     "type" "ConnectionType" NOT NULL DEFAULT 'HTTP';
