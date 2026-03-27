-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('UP', 'PENDING', 'DOWN');

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "status" "MonitorStatus" NOT NULL DEFAULT 'UP';
