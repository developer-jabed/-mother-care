/*
  Warnings:

  - A unique constraint covering the columns `[studentEnrollmentId,feeTypeId,month,year]` on the table `StudentFee` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "StudentFee_studentEnrollmentId_feeTypeId_month_year_key" ON "StudentFee"("studentEnrollmentId", "feeTypeId", "month", "year");
