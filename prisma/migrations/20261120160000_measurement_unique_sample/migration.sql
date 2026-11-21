-- CreateIndex
CREATE UNIQUE INDEX "Measurement_dimensionId_sampleNo_key" ON "Measurement"("dimensionId", "sampleNo");
