/*
  Warnings:

  - Added the required column `updatedAt` to the `SmsLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "SmsLog" DROP CONSTRAINT "SmsLog_examId_fkey";

-- AlterTable
ALTER TABLE "SmsLog" ADD COLUMN     "studentFeeId" INTEGER,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'RESULT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "examId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SmsLog_studentEnrollmentId_type_idx" ON "SmsLog"("studentEnrollmentId", "type");

-- CreateIndex
CREATE INDEX "SmsLog_status_idx" ON "SmsLog"("status");

-- CreateIndex
CREATE INDEX "SmsLog_type_idx" ON "SmsLog"("type");

-- CreateIndex
CREATE INDEX "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
