/*
  Warnings:

  - You are about to drop the column `refresh_token_expires_in` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Account" DROP COLUMN "refresh_token_expires_in";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password";

-- CreateTable
CREATE TABLE "Key" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessGranted" BOOLEAN NOT NULL,
    "message" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Key_keyId_key" ON "Key"("keyId");

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "Key"("keyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
