import { calculateCpk, type CpkResult } from "./cpk";
import { parseCell, type DraftDimension } from "./draft";

/** Menghilangkan noise floating point (mis. 1.5299999999999998 -> 1.53). */
export function clean(n: number, digits = 6): number {
  return Number(n.toFixed(digits));
}

export function fmtFixed(n: number | null, digits: number): string {
  return n === null ? "–" : n.toFixed(digits);
}

export function fmtTrim(n: number | null, digits = 4): string {
  return n === null ? "–" : String(clean(n, digits));
}

export function formatTarget(nominal: number, tolerance: number): string {
  return `${clean(nominal)} ± ${clean(tolerance)}`;
}

export function dimensionStats(
  dimension: DraftDimension,
  cpkThreshold: number,
): CpkResult {
  return calculateCpk(
    dimension.values.map(parseCell),
    dimension.nominal,
    dimension.tolerance,
    cpkThreshold,
  );
}
