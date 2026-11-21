import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculateCpk } from "./cpk";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json(
    { error: "Terjadi kesalahan pada server" },
    { status: 500 },
  );
}

export const trialDetailInclude = {
  dimensions: {
    orderBy: { orderIndex: "asc" },
    include: { measurements: { orderBy: { sampleNo: "asc" } } },
  },
} satisfies Prisma.TrialInclude;

// ---------------------------------------------------------------------------
// Parsing & validasi input
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJson(request: Request): Promise<JsonObject> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Body harus berupa JSON yang valid");
  }
  if (!isRecord(body)) {
    throw new HttpError(400, "Body harus berupa objek JSON");
  }
  return body;
}

const REQUIRED_STRING_FIELDS = [
  "productName",
  "productParts",
  "partNumber",
  "inspectionDate",
  "trialLevel",
] as const;

const OPTIONAL_STRING_FIELDS = [
  "supplier",
  "receivedDate",
  "sampleQty",
  "material",
  "measuringTool",
  "measuredBy",
  "machineSettings",
] as const;

export type TrialFields = {
  [K in (typeof REQUIRED_STRING_FIELDS)[number]]: string;
} & {
  [K in (typeof OPTIONAL_STRING_FIELDS)[number]]: string | null;
} & { cpkThreshold: number };

export function parseTrialFields(body: JsonObject, mode: "create"): Partial<TrialFields> & Pick<TrialFields, (typeof REQUIRED_STRING_FIELDS)[number]>;
export function parseTrialFields(body: JsonObject, mode: "update"): Partial<TrialFields>;
export function parseTrialFields(
  body: JsonObject,
  mode: "create" | "update",
): Partial<TrialFields> {
  const out: Record<string, unknown> = {};

  for (const key of REQUIRED_STRING_FIELDS) {
    const value = body[key];
    if (value === undefined) {
      if (mode === "create") throw new HttpError(400, `Field "${key}" wajib diisi`);
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      throw new HttpError(400, `Field "${key}" harus berupa teks yang tidak kosong`);
    }
    out[key] = value.trim();
  }

  for (const key of OPTIONAL_STRING_FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null) {
      out[key] = null;
    } else if (typeof value === "string") {
      out[key] = value;
    } else if (key === "sampleQty" && typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(value);
    } else {
      throw new HttpError(400, `Field "${key}" harus berupa teks atau null`);
    }
  }

  if (body.cpkThreshold !== undefined) {
    const value = body.cpkThreshold;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new HttpError(400, `Field "cpkThreshold" harus berupa angka`);
    }
    out.cpkThreshold = value;
  }

  return out as Partial<TrialFields>;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} harus berupa angka`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${label} harus berupa teks yang tidak kosong`);
  }
  return value.trim();
}

function optionalOrderIndex(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${label} harus berupa bilangan bulat >= 0`);
  }
  return value;
}

function tolerance(value: unknown, label: string): number {
  const n = finiteNumber(value, label);
  if (n < 0) throw new HttpError(400, `${label} tidak boleh negatif`);
  return n;
}

export interface DimensionCreateInput {
  name: string;
  nominal: number;
  tolerance: number;
  orderIndex?: number;
}

export interface DimensionUpdateInput {
  id: string;
  name?: string;
  nominal?: number;
  tolerance?: number;
  orderIndex?: number;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${label} harus berupa array`);
  }
  return value;
}

export function parseDimensionCreates(
  value: unknown,
  label: string,
): DimensionCreateInput[] {
  return asArray(value, label).map((item, i) => {
    const at = `${label}[${i}]`;
    if (!isRecord(item)) throw new HttpError(400, `${at} harus berupa objek`);
    return {
      name: nonEmptyString(item.name, `${at}.name`),
      nominal: finiteNumber(item.nominal, `${at}.nominal`),
      tolerance: tolerance(item.tolerance, `${at}.tolerance`),
      orderIndex: optionalOrderIndex(item.orderIndex, `${at}.orderIndex`),
    };
  });
}

export function parseDimensionUpdates(
  value: unknown,
  label: string,
): DimensionUpdateInput[] {
  return asArray(value, label).map((item, i) => {
    const at = `${label}[${i}]`;
    if (!isRecord(item)) throw new HttpError(400, `${at} harus berupa objek`);
    const out: DimensionUpdateInput = { id: nonEmptyString(item.id, `${at}.id`) };
    if (item.name !== undefined) out.name = nonEmptyString(item.name, `${at}.name`);
    if (item.nominal !== undefined) out.nominal = finiteNumber(item.nominal, `${at}.nominal`);
    if (item.tolerance !== undefined) out.tolerance = tolerance(item.tolerance, `${at}.tolerance`);
    out.orderIndex = optionalOrderIndex(item.orderIndex, `${at}.orderIndex`);
    return out;
  });
}

export function parseIdList(value: unknown, label: string): string[] {
  return asArray(value, label).map((item, i) =>
    nonEmptyString(item, `${label}[${i}]`),
  );
}

export interface MeasurementInput {
  dimensionId: string;
  sampleNo: number;
  value: number | null;
}

export function parseMeasurements(value: unknown, label: string): MeasurementInput[] {
  return asArray(value, label).map((item, i) => {
    const at = `${label}[${i}]`;
    if (!isRecord(item)) throw new HttpError(400, `${at} harus berupa objek`);
    const sampleNo = item.sampleNo;
    if (typeof sampleNo !== "number" || !Number.isInteger(sampleNo) || sampleNo < 1) {
      throw new HttpError(400, `${at}.sampleNo harus berupa bilangan bulat >= 1`);
    }
    if (item.value !== null && item.value !== undefined && typeof item.value !== "number") {
      throw new HttpError(400, `${at}.value harus berupa angka atau null`);
    }
    if (typeof item.value === "number" && !Number.isFinite(item.value)) {
      throw new HttpError(400, `${at}.value harus berupa angka yang valid`);
    }
    return {
      dimensionId: nonEmptyString(item.dimensionId, `${at}.dimensionId`),
      sampleNo,
      value: typeof item.value === "number" ? item.value : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Ringkasan status
// ---------------------------------------------------------------------------

export interface TrialSummary {
  dimensionCount: number;
  /** Dimensi yang punya cukup data untuk dihitung Cpk. */
  evaluatedCount: number;
  passCount: number;
  /** Dimensi yang sudah dihitung tetapi Cpk di bawah threshold. */
  failCount: number;
  /** Dimensi yang belum cukup data (< 2 nilai valid atau stdev = 0). */
  pendingCount: number;
  /** "Pass" hanya jika ada dimensi dan semuanya lulus. */
  status: "Pass" | "N/A";
}

export function summarizeTrial(trial: {
  cpkThreshold: number;
  dimensions: {
    nominal: number;
    tolerance: number;
    measurements: { value: number | null }[];
  }[];
}): TrialSummary {
  let evaluatedCount = 0;
  let passCount = 0;

  for (const dimension of trial.dimensions) {
    const result = calculateCpk(
      dimension.measurements.map((m) => m.value),
      dimension.nominal,
      dimension.tolerance,
      trial.cpkThreshold,
    );
    if (result.cpk !== null) {
      evaluatedCount++;
      if (result.status === "Pass") passCount++;
    }
  }

  const dimensionCount = trial.dimensions.length;
  return {
    dimensionCount,
    evaluatedCount,
    passCount,
    failCount: evaluatedCount - passCount,
    pendingCount: dimensionCount - evaluatedCount,
    status: dimensionCount > 0 && passCount === dimensionCount ? "Pass" : "N/A",
  };
}
