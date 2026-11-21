import type { TrialSummary } from "./trials";

export type { TrialSummary };

export interface MeasurementDTO {
  id: string;
  dimensionId: string;
  sampleNo: number;
  value: number | null;
}

export interface DimensionDTO {
  id: string;
  trialId: string;
  orderIndex: number;
  name: string;
  nominal: number;
  tolerance: number;
  measurements: MeasurementDTO[];
}

export interface TrialMeta {
  productName: string;
  productParts: string;
  partNumber: string;
  supplier: string | null;
  receivedDate: string | null;
  inspectionDate: string;
  sampleQty: string | null;
  trialLevel: string;
  material: string | null;
  measuringTool: string | null;
  measuredBy: string | null;
  cpkThreshold: number;
  machineSettings: string | null;
}

export interface TrialDTO extends TrialMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  dimensions: DimensionDTO[];
}

export interface TrialListItem extends TrialMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary: TrialSummary;
}
