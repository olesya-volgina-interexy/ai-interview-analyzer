/*
  Warnings:

  - Added the required column `stage` to the `Interview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "stage" TEXT NOT NULL,
ALTER COLUMN "decision" DROP NOT NULL;
