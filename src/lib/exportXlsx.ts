import {
  META_KEYS,
  META_LABELS,
  parseCell,
  type Draft,
} from "./draft";
import { clean, dimensionStats, formatTarget } from "./format";

type Cell = string | number | null;

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

export async function exportDraftToXlsx(draft: Draft) {
  const XLSX = await import("xlsx");

  const rows: Cell[][] = [];
  rows.push(["First Article Inspection (FAI) Report"]);
  rows.push([]);

  for (const key of META_KEYS) {
    rows.push([META_LABELS[key], draft.meta[key].trim()]);
  }
  rows.push(["Target Cpk", draft.cpkThreshold]);

  const params = draft.machine.params.filter((p) => p.name.trim() || p.value.trim());
  if (params.length > 0 || draft.machine.notes.trim()) {
    rows.push([]);
    rows.push(["Machine Settings"]);
    for (const p of params) rows.push([p.name.trim(), p.value.trim(), p.unit.trim()]);
    if (draft.machine.notes.trim()) {
      const notesLines = draft.machine.notes.trim().split("\n");
      for (const line of notesLines) {
        if (line.trim()) rows.push(["Setting / Notes", line.trim()]);
      }
    }
  }

  rows.push([]);

  rows.push(["Sample", ...draft.dimensions.map((d) => d.name)]);
  rows.push(["Target", ...draft.dimensions.map((d) => formatTarget(d.nominal, d.tolerance))]);

  for (let i = 0; i < draft.sampleCount; i++) {
    rows.push([i + 1, ...draft.dimensions.map((d) => parseCell(d.values[i] ?? ""))]);
  }

  const stats = draft.dimensions.map((d) => dimensionStats(d, draft.cpkThreshold));
  const num = (v: number | null): Cell => (v === null ? null : clean(v, 6));
  rows.push(["MIN", ...stats.map((s) => num(s.min))]);
  rows.push(["MAX", ...stats.map((s) => num(s.max))]);
  rows.push(["x̄ (mean)", ...stats.map((s) => num(s.mean))]);
  rows.push(["s (stdev)", ...stats.map((s) => num(s.stdev))]);
  rows.push(["Cp", ...stats.map((s) => num(s.cp))]);
  rows.push(["Cpk", ...stats.map((s) => num(s.cpk))]);
  rows.push(["PASS/N/A", ...stats.map((s) => s.status)]);
  rows.push(["CpU", ...stats.map((s) => num(s.cpU))]);
  rows.push(["CpL", ...stats.map((s) => num(s.cpL))]);
  rows.push(["USL", ...stats.map((s) => num(s.usl))]);
  rows.push(["LSL", ...stats.map((s) => num(s.lsl))]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 30 },
    ...draft.dimensions.map(() => ({ wch: 16 })),
  ];
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(draft.dimensions.length, 3) } }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "FAI");

  const filename = sanitizeFilename(
    `FAI_${draft.meta.partNumber.trim() || "trial"}_${draft.meta.trialLevel.trim() || ""}`,
  ).replace(/_+$/, "");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
