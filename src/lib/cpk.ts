export type CpkStatus = "Pass" | "N/A";

export interface CpkResult {
  /** Jumlah data numerik yang valid. */
  count: number;
  usl: number;
  lsl: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Standar deviasi sampel (n - 1), setara STDEV.S. Null jika data valid < 2. */
  stdev: number | null;
  cp: number | null;
  cpU: number | null;
  cpL: number | null;
  cpk: number | null;
  status: CpkStatus;
}

export function calculateCpk(
  values: (number | null)[],
  nominal: number,
  tolerance: number,
  cpkThreshold = 1.0,
): CpkResult {
  const usl = nominal + tolerance;
  const lsl = nominal - tolerance;

  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const count = valid.length;

  if (count === 0) {
    return {
      count,
      usl,
      lsl,
      min: null,
      max: null,
      mean: null,
      stdev: null,
      cp: null,
      cpU: null,
      cpL: null,
      cpk: null,
      status: "N/A",
    };
  }

  let min = valid[0];
  let max = valid[0];
  let sum = 0;
  for (const v of valid) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / count;

  if (count < 2) {
    return {
      count,
      usl,
      lsl,
      min,
      max,
      mean,
      stdev: null,
      cp: null,
      cpU: null,
      cpL: null,
      cpk: null,
      status: "N/A",
    };
  }

  const sumSquares = valid.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  const stdev = Math.sqrt(sumSquares / (count - 1));

  if (stdev === 0) {
    return {
      count,
      usl,
      lsl,
      min,
      max,
      mean,
      stdev,
      cp: null,
      cpU: null,
      cpL: null,
      cpk: null,
      status: "N/A",
    };
  }

  const cp = (usl - lsl) / (6 * stdev);
  const cpU = (usl - mean) / (3 * stdev);
  const cpL = (mean - lsl) / (3 * stdev);
  const cpk = Math.min(cpU, cpL);
  const status: CpkStatus = cpk >= cpkThreshold ? "Pass" : "N/A";

  return { count, usl, lsl, min, max, mean, stdev, cp, cpU, cpL, cpk, status };
}
