import { calculateCpk, type CpkResult } from "./cpk";
import type { TrialDTO } from "./types";

export const DEFAULT_SAMPLE_COUNT = 10;

export const META_KEYS = [
  "productName",
  "productParts",
  "partNumber",
  "supplier",
  "receivedDate",
  "inspectionDate",
  "sampleQty",
  "trialLevel",
  "material",
  "measuringTool",
  "measuredBy",
] as const;

export type MetaKey = (typeof META_KEYS)[number];
export type DraftMeta = Record<MetaKey, string>;

export const META_LABELS: Record<MetaKey, string> = {
  productName: "Sample/Product Name",
  productParts: "Product Parts",
  partNumber: "Part Number",
  supplier: "Supplier / Mold Maker",
  receivedDate: "Received Date",
  inspectionDate: "Inspection Date",
  sampleQty: "Quantity of Inspected Sample",
  trialLevel: "Type of Sample (Trial level)",
  material: "Material",
  measuringTool: "Measuring Tool",
  measuredBy: "Measured by",
};

const REQUIRED_META: readonly MetaKey[] = [
  "productName",
  "productParts",
  "partNumber",
  "inspectionDate",
  "trialLevel",
];

export interface MachineParam {
  name: string;
  value: string;
  unit: string;
}

export interface MachineSettings {
  params: MachineParam[];
  notes: string;
}

export interface DraftDimension {
  /** Kunci stabil untuk React; untuk dimensi baru berupa UUID sementara. */
  key: string;
  /** Kosong untuk dimensi yang belum tersimpan di server. */
  id?: string;
  orderIndex: number;
  name: string;
  nominal: number;
  tolerance: number;
  /** Nilai mentah sel (string) per sampel; panjang selalu sama dengan sampleCount. */
  values: string[];
}

export interface Draft {
  meta: DraftMeta;
  cpkThreshold: number;
  machine: MachineSettings;
  sampleCount: number;
  dimensions: DraftDimension[];
}

// ---------------------------------------------------------------------------
// Parsing nilai sel
// ---------------------------------------------------------------------------

/** Mengubah teks sel menjadi angka. Koma desimal ("1,5") diterima. */
export function parseCell(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function isInvalidCell(raw: string): boolean {
  return raw.trim() !== "" && parseCell(raw) === null;
}

// ---------------------------------------------------------------------------
// Machine settings (disimpan sebagai teks/JSON string di Trial.machineSettings)
// ---------------------------------------------------------------------------

export function parseMachineSettings(json: string | null): MachineSettings {
  if (!json) return { params: [], notes: "" };
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { params?: unknown }).params)
    ) {
      const { params, notes } = parsed as { params: unknown[]; notes?: unknown };
      return {
        params: params.map((p) => {
          const o = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
          return {
            name: typeof o.name === "string" ? o.name : "",
            value: typeof o.value === "string" ? o.value : "",
            unit: typeof o.unit === "string" ? o.unit : "",
          };
        }),
        notes: typeof notes === "string" ? notes : "",
      };
    }
  } catch {
    // bukan JSON: perlakukan sebagai catatan teks biasa
  }
  return { params: [], notes: json };
}

export function serializeMachineSettings(machine: MachineSettings): string | null {
  const params = machine.params
    .map((p) => ({ name: p.name.trim(), value: p.value.trim(), unit: p.unit.trim() }))
    .filter((p) => p.name !== "" || p.value !== "");
  const notes = machine.notes.trim();
  if (params.length === 0 && notes === "") return null;
  if (params.length === 0) return notes;
  return JSON.stringify({ params, notes });
}

// ---------------------------------------------------------------------------
// Konversi trial <-> draft
// ---------------------------------------------------------------------------

export function draftFromTrial(trial: TrialDTO): Draft {
  const meta = {} as DraftMeta;
  for (const key of META_KEYS) meta[key] = trial[key] ?? "";

  let maxSampleNo = 0;
  for (const d of trial.dimensions) {
    for (const m of d.measurements) maxSampleNo = Math.max(maxSampleNo, m.sampleNo);
  }
  const sampleCount = maxSampleNo > 0 ? maxSampleNo : DEFAULT_SAMPLE_COUNT;

  const dimensions = [...trial.dimensions]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((d): DraftDimension => {
      const values = Array<string>(sampleCount).fill("");
      for (const m of d.measurements) {
        if (m.value !== null) values[m.sampleNo - 1] = String(m.value);
      }
      return {
        key: d.id,
        id: d.id,
        orderIndex: d.orderIndex,
        name: d.name,
        nominal: d.nominal,
        tolerance: d.tolerance,
        values,
      };
    });

  return {
    meta,
    cpkThreshold: trial.cpkThreshold,
    machine: parseMachineSettings(trial.machineSettings),
    sampleCount,
    dimensions,
  };
}

/** Representasi string untuk mendeteksi perubahan yang belum disimpan. */
export function snapshotDraft(draft: Draft): string {
  return JSON.stringify([
    META_KEYS.map((k) => draft.meta[k].trim()),
    draft.cpkThreshold,
    serializeMachineSettings(draft.machine),
    draft.sampleCount,
    draft.dimensions.map((d) => [
      d.id ?? null,
      d.orderIndex,
      d.name,
      d.nominal,
      d.tolerance,
      d.values.map((v) => v.trim()),
    ]),
  ]);
}

export function validateDraft(draft: Draft): string | null {
  for (const key of REQUIRED_META) {
    if (draft.meta[key].trim() === "") {
      return `Field "${META_LABELS[key]}" wajib diisi`;
    }
  }
  if (!Number.isFinite(draft.cpkThreshold) || draft.cpkThreshold <= 0) {
    return "Target Cpk harus berupa angka lebih dari 0";
  }
  let invalid = 0;
  for (const d of draft.dimensions) {
    for (const v of d.values) if (isInvalidCell(v)) invalid++;
  }
  if (invalid > 0) {
    return `${invalid} sel berisi teks yang bukan angka (ditandai oranye). Perbaiki atau kosongkan dulu.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload untuk PATCH /api/trials/[id]
// ---------------------------------------------------------------------------

export function buildMetaPayload(draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of META_KEYS) {
    const v = draft.meta[key].trim();
    out[key] = REQUIRED_META.includes(key) ? v : v === "" ? null : v;
  }
  out.cpkThreshold = draft.cpkThreshold;
  out.machineSettings = serializeMachineSettings(draft.machine);
  return out;
}

export function buildDimensionOps(draft: Draft, saved: TrialDTO) {
  const draftIds = new Set(
    draft.dimensions.flatMap((d) => (d.id ? [d.id] : [])),
  );
  const remove = saved.dimensions.filter((d) => !draftIds.has(d.id)).map((d) => d.id);

  const add = draft.dimensions
    .filter((d) => !d.id)
    .map(({ name, nominal, tolerance, orderIndex }) => ({
      name,
      nominal,
      tolerance,
      orderIndex,
    }));

  const update = draft.dimensions.flatMap((d) => {
    if (!d.id) return [];
    const s = saved.dimensions.find((x) => x.id === d.id);
    if (!s) return [];
    const changed =
      s.name !== d.name ||
      s.nominal !== d.nominal ||
      s.tolerance !== d.tolerance ||
      s.orderIndex !== d.orderIndex;
    return changed
      ? [{ id: d.id, name: d.name, nominal: d.nominal, tolerance: d.tolerance, orderIndex: d.orderIndex }]
      : [];
  });

  return { add, update, remove };
}

/** Mengisi `id` untuk dimensi baru berdasarkan orderIndex yang sama di respons server. */
export function assignServerIds(draft: Draft, server: TrialDTO): Draft {
  return {
    ...draft,
    dimensions: draft.dimensions.map((d) => {
      if (d.id) return d;
      const match = server.dimensions.find((s) => s.orderIndex === d.orderIndex);
      return match ? { ...d, id: match.id } : d;
    }),
  };
}

/** Sel yang baru atau berubah dibanding state server (termasuk sel kosong yang belum punya baris). */
export function buildMeasurementCells(draft: Draft, server: TrialDTO) {
  const cells: { dimensionId: string; sampleNo: number; value: number | null }[] = [];
  for (const d of draft.dimensions) {
    if (!d.id) continue;
    const serverDim = server.dimensions.find((s) => s.id === d.id);
    if (!serverDim) continue;
    const existing = new Map(serverDim.measurements.map((m) => [m.sampleNo, m.value]));
    for (let i = 0; i < draft.sampleCount; i++) {
      const value = parseCell(d.values[i] ?? "");
      const sampleNo = i + 1;
      const hasExisting = existing.has(sampleNo);
      const existingVal = existing.get(sampleNo) ?? null;
      if (hasExisting) {
        if (existingVal !== value) {
          cells.push({ dimensionId: d.id, sampleNo, value });
        }
      } else {
        if (value !== null) {
          cells.push({ dimensionId: d.id, sampleNo, value });
        }
      }
    }
  }
  return cells;
}
