-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "productParts" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "supplier" TEXT,
    "receivedDate" TEXT,
    "inspectionDate" TEXT NOT NULL,
    "sampleQty" TEXT,
    "trialLevel" TEXT NOT NULL,
    "material" TEXT,
    "measuringTool" TEXT,
    "measuredBy" TEXT,
    "cpkThreshold" REAL NOT NULL DEFAULT 1.0,
    "machineSettings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Dimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trialId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nominal" REAL NOT NULL,
    "tolerance" REAL NOT NULL,
    CONSTRAINT "Dimension_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dimensionId" TEXT NOT NULL,
    "sampleNo" INTEGER NOT NULL,
    "value" REAL,
    CONSTRAINT "Measurement_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "Dimension" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
