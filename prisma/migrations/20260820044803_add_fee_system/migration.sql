-- CreateIndex
CREATE INDEX "StudentFee_feeTypeId_month_year_idx" ON "StudentFee"("feeTypeId", "month", "year");

-- CreateIndex
CREATE INDEX "StudentFee_status_dueDate_idx" ON "StudentFee"("status", "dueDate");
