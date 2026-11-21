"use client";

import {
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowRight, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { isInvalidCell, parseCell, type DraftDimension } from "@/lib/draft";
import {
  clean,
  dimensionStats,
  fmtFixed,
  fmtTrim,
  formatTarget,
} from "@/lib/format";

export interface DimensionInput {
  /** Kosong untuk dimensi baru. */
  key?: string;
  name: string;
  nominal: number;
  tolerance: number;
}

interface MeasurementGridProps {
  dimensions: DraftDimension[];
  sampleCount: number;
  cpkThreshold: number;
  onCellChange: (dimIndex: number, sampleIndex: number, value: string) => void;
  onPasteBlock: (startSample: number, startDim: number, matrix: string[][]) => void;
  onAddSamples: (count: number) => void;
  onRemoveLastSample: () => void;
  onSaveDimension: (input: DimensionInput) => void;
  onDeleteDimension: (key: string) => void;
}

type NavMode = "vertical" | "horizontal";
type DialogState = { mode: "new" } | { mode: "edit"; key: string } | null;

export default function MeasurementGrid({
  dimensions,
  sampleCount,
  cpkThreshold,
  onCellChange,
  onPasteBlock,
  onAddSamples,
  onRemoveLastSample,
  onSaveDimension,
  onDeleteDimension,
}: MeasurementGridProps) {
  const [navMode, setNavMode] = useState<NavMode>("vertical");
  const [dialog, setDialog] = useState<DialogState>(null);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());

  const stats = useMemo(
    () => dimensions.map((d) => dimensionStats(d, cpkThreshold)),
    [dimensions, cpkThreshold],
  );

  function focusCell(row: number, col: number) {
    const el = cellRefs.current.get(`${row}:${col}`);
    if (el) {
      el.focus();
      el.select();
    }
  }

  /** Sel berikutnya (dir = 1) atau sebelumnya (dir = -1) menurut arah navigasi Enter. */
  function stepCell(row: number, col: number, dir: 1 | -1): [number, number] | null {
    const rows = sampleCount;
    const cols = dimensions.length;
    let nr = row;
    let nc = col;
    if (navMode === "vertical") {
      nr = row + dir;
      if (nr < 0 || nr >= rows) {
        nc = col + dir;
        nr = dir > 0 ? 0 : rows - 1;
      }
    } else {
      nc = col + dir;
      if (nc < 0 || nc >= cols) {
        nr = row + dir;
        nc = dir > 0 ? 0 : cols - 1;
      }
    }
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
    return [nr, nc];
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const input = e.currentTarget;
    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        const next = stepCell(row, col, e.shiftKey ? -1 : 1);
        if (next) focusCell(next[0], next[1]);
        break;
      }
      case "ArrowDown":
        e.preventDefault();
        if (row + 1 < sampleCount) focusCell(row + 1, col);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (row > 0) focusCell(row - 1, col);
        break;
      case "ArrowRight":
        if (input.selectionEnd === input.value.length && col + 1 < dimensions.length) {
          e.preventDefault();
          focusCell(row, col + 1);
        }
        break;
      case "ArrowLeft":
        if (input.selectionStart === 0 && col > 0) {
          e.preventDefault();
          focusCell(row, col - 1);
        }
        break;
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const text = e.clipboardData.getData("text").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    if (!/[\t\n]/.test(text)) return; // satu nilai: biarkan paste bawaan
    e.preventDefault();
    const matrix = text
      .split("\n")
      .map((line) => line.split("\t").map((s) => s.trim().replace(/^"(.*)"$/, "$1").trim()));
    onPasteBlock(row, col, matrix);
  }

  const editingDimension =
    dialog?.mode === "edit" ? dimensions.find((d) => d.key === dialog.key) : undefined;

  return (
    <section className="rounded-lg border border-slate-300 bg-white shadow-2xs print:border-0 print:shadow-none">
      {/* Action Bar / Controls (flex-wrap responsif untuk layar HP dan desktop) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 print:hidden">
        {/* Sisi Kiri: Judul & Toggle Caliper */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Grid Pengukuran
          </h2>

          {/* Digital Caliper Navigation Mode */}
          <div
            className="inline-flex overflow-hidden rounded border border-slate-300 text-xs shadow-2xs"
            role="group"
            aria-label="Arah navigasi tombol Enter (Caliper HID)"
          >
            <button
              type="button"
              aria-pressed={navMode === "vertical"}
              onClick={() => setNavMode("vertical")}
              title="Digital Caliper: Enter turun ke sampel berikutnya"
              className={`flex items-center gap-1 px-2 py-1 font-medium text-[11px] transition ${
                navMode === "vertical"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ArrowDown size={13} /> Vertikal (Enter ↓)
            </button>
            <button
              type="button"
              aria-pressed={navMode === "horizontal"}
              onClick={() => setNavMode("horizontal")}
              title="Digital Caliper: Enter geser ke dimensi berikutnya"
              className={`flex items-center gap-1 border-l border-slate-300 px-2 py-1 font-medium text-[11px] transition ${
                navMode === "horizontal"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ArrowRight size={13} /> Horizontal (Enter →)
            </button>
          </div>
        </div>

        {/* Sisi Kanan: Jumlah sampel & tombol-tombol aksi baris/dimensi */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-xs">
          <span className="font-semibold text-slate-600 mr-1 text-[11px]">
            {sampleCount} sampel
          </span>
          <button
            type="button"
            onClick={() => onAddSamples(1)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <Plus size={12} /> Baris
          </button>
          <button
            type="button"
            onClick={() => onAddSamples(5)}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <Plus size={12} /> 5 baris
          </button>
          <button
            type="button"
            onClick={onRemoveLastSample}
            disabled={sampleCount <= 1}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-2xs disabled:opacity-40"
          >
            <Minus size={12} /> Hapus baris terakhir
          </button>
          <button
            type="button"
            onClick={() => setDialog({ mode: "new" })}
            className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 shadow-2xs"
          >
            <Plus size={13} /> Dimensi
          </button>
        </div>
      </div>

      {dimensions.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">
          Belum ada dimensi. Klik <strong>+ Dimensi</strong> untuk menambahkan kolom pengukuran.
        </p>
      ) : (
        /* Container grid dengan tinggi fleksibel max-h-[70vh] dan overflow-auto */
        <div className="max-h-[70vh] overflow-auto print:max-h-none print:overflow-visible relative border-t border-slate-200">
          <table className="w-full border-separate border-spacing-0 text-sm print:text-[10px]">
            <thead>
              <tr>
                {/* Header Sample pojok kiri atas sticky top-0 left-0 z-30 */}
                <th className="sticky left-0 top-0 z-30 min-w-14 w-14 border-b border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 print:[print-color-adjust:exact]">
                  Sample
                </th>
                {dimensions.map((d) => (
                  /* Header kolom dimensi sticky top-0 z-20 dengan lebar min-w-[82px] dan padding px-1.5 */
                  <th
                    key={d.key}
                    className="sticky top-0 z-20 min-w-[82px] border-b border-r border-slate-300 bg-slate-100 px-1.5 py-1 text-center align-top print:[print-color-adjust:exact]"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-bold text-slate-900 text-xs">{d.name}</span>
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "edit", key: d.key })}
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 print:hidden"
                        aria-label={`Edit dimensi ${d.name}`}
                        title={`Edit dimensi ${d.name}`}
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                    <div className="text-[11px] font-medium tabular-nums text-slate-600 truncate">
                      {formatTarget(d.nominal, d.tolerance)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: sampleCount }, (_, r) => (
                <tr key={r}>
                  {/* Kolom kiri nomor sampel sticky left-0 z-10 */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-14 w-14 border-b border-r border-slate-200 bg-slate-50 px-2 py-0 text-left text-xs font-medium text-slate-600 print:[print-color-adjust:exact]"
                  >
                    {r + 1}
                  </th>
                  {dimensions.map((d, c) => {
                    const raw = d.values[r] ?? "";
                    const num = parseCell(raw);
                    const invalid = isInvalidCell(raw);
                    const outOfSpec =
                      num !== null && (num < stats[c].lsl || num > stats[c].usl);

                    // Highlight merah otomatis jika nilai di luar rentang [LSL, USL]
                    const tone = invalid
                      ? "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-400 font-medium"
                      : outOfSpec
                        ? "bg-red-200 font-bold text-red-900 ring-1 ring-inset ring-red-500 print:[print-color-adjust:exact]"
                        : "bg-white text-slate-900";

                    return (
                      <td key={d.key} className="border-b border-r border-slate-200 p-0 min-w-[82px]">
                        <input
                          ref={(el) => {
                            const k = `${r}:${c}`;
                            if (el) cellRefs.current.set(k, el);
                            else cellRefs.current.delete(k);
                          }}
                          value={raw}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${d.name} sampel ${r + 1}`}
                          aria-invalid={invalid || outOfSpec}
                          title={
                            invalid
                              ? "Bukan angka"
                              : outOfSpec
                                ? `Di luar rentang spesifikasi [${fmtTrim(stats[c].lsl)}, ${fmtTrim(stats[c].usl)}]`
                                : undefined
                          }
                          onChange={(e) => onCellChange(c, r, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => handleKeyDown(e, r, c)}
                          onPaste={(e) => handlePaste(e, r, c)}
                          className={`block h-7 w-full min-w-[78px] px-1.5 text-right tabular-nums text-xs outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 print:text-[9px] ${tone}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            {/* Baris Kuning (Real-Time):
                Baris statistik detail (MIN..LSL) berada di bawah sampel,
                sementara Cpk dan PASS/N/A dibuat sticky bottom-0 z-20 agar selalu terpantau oleh operator */}
            <tfoot>
              <StatRow label="MIN" cells={stats.map((s) => fmtTrim(s.min))} />
              <StatRow label="MAX" cells={stats.map((s) => fmtTrim(s.max))} />
              <StatRow label="x̄ (mean)" cells={stats.map((s) => fmtFixed(s.mean, 4))} />
              <StatRow label="s (stdev)" cells={stats.map((s) => fmtFixed(s.stdev, 4))} />
              <StatRow label="Cp" cells={stats.map((s) => fmtFixed(s.cp, 3))} />
              <StatRow label="CpU" cells={stats.map((s) => fmtFixed(s.cpU, 3))} />
              <StatRow label="CpL" cells={stats.map((s) => fmtFixed(s.cpL, 3))} />
              <StatRow label="USL" cells={stats.map((s) => fmtTrim(s.usl))} />
              <StatRow label="LSL" cells={stats.map((s) => fmtTrim(s.lsl))} />

              {/* Baris Sticky Bottom: Cpk & PASS/N/A dengan shadow tipis agar operator selalu melihat status kelulusan */}
              <StatRow
                label="Cpk"
                bold
                stickyBottom="bottom-[27px]"
                extraShadow
                cells={stats.map((s) => fmtFixed(s.cpk, 3))}
              />
              <StatRow
                label="PASS/N/A"
                stickyBottom="bottom-0"
                cells={stats.map((s) => (
                  <StatusBadge status={s.status} hasValue={s.cpk !== null} />
                ))}
              />
            </tfoot>
          </table>
        </div>
      )}

      <p className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 print:hidden">
        💡 <strong>Digital Caliper &amp; Navigasi:</strong> Enter pindah sel otomatis menyeleksi isi (Shift+Enter mundur). Mendukung <strong>Ctrl+V</strong> dari Excel. Baris ringkasan <strong>Cpk &amp; PASS/N/A</strong> menempel di bawah agar selalu terpantau.
      </p>

      {dialog && (
        <DimensionDialog
          key={dialog.mode === "edit" ? dialog.key : "new"}
          dimension={editingDimension}
          onCancel={() => setDialog(null)}
          onSubmit={(input) => {
            onSaveDimension(input);
            setDialog(null);
          }}
          onDelete={
            editingDimension
              ? () => {
                  if (
                    window.confirm(
                      `Hapus dimensi "${editingDimension.name}" beserta seluruh nilainya?`,
                    )
                  ) {
                    onDeleteDimension(editingDimension.key);
                    setDialog(null);
                  }
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function StatRow({
  label,
  cells,
  bold,
  stickyBottom,
  extraShadow,
}: {
  label: string;
  cells: ReactNode[];
  bold?: boolean;
  stickyBottom?: string;
  extraShadow?: boolean;
}) {
  const isSticky = Boolean(stickyBottom);
  return (
    <tr
      className={`bg-yellow-200 print:[print-color-adjust:exact] ${
        extraShadow ? "shadow-[0_-3px_5px_-1px_rgba(0,0,0,0.12)]" : ""
      }`}
    >
      <th
        scope="row"
        className={`border-b border-r border-yellow-400 bg-yellow-200 px-2 py-1 text-left text-xs font-bold text-slate-900 print:[print-color-adjust:exact] print:static ${
          isSticky
            ? `sticky left-0 ${stickyBottom} z-30 shadow-[2px_0_0_0_rgba(250,204,21,1)]`
            : "sticky left-0 z-10"
        }`}
      >
        {label}
      </th>
      {cells.map((cell, i) => (
        <td
          key={i}
          className={`border-b border-r border-yellow-400 bg-yellow-200 px-1.5 py-0.5 text-center tabular-nums text-slate-900 min-w-[82px] print:[print-color-adjust:exact] print:static ${
            bold ? "font-bold text-slate-950 text-xs" : "font-medium text-xs"
          } ${isSticky ? `sticky ${stickyBottom} z-20` : ""}`}
        >
          {cell}
        </td>
      ))}
    </tr>
  );
}

function StatusBadge({ status, hasValue }: { status: "Pass" | "N/A"; hasValue: boolean }) {
  if (status === "Pass") {
    return (
      <span className="inline-block rounded bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs print:[print-color-adjust:exact]">
        PASS
      </span>
    );
  }
  return (
    <span
      title={hasValue ? "Cpk di bawah target" : "Data belum cukup untuk menghitung Cpk"}
      className="inline-block rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs print:[print-color-adjust:exact]"
    >
      N/A
    </span>
  );
}

function DimensionDialog({
  dimension,
  onSubmit,
  onCancel,
  onDelete,
}: {
  dimension?: DraftDimension;
  onSubmit: (input: DimensionInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(dimension?.name ?? "");
  const [nominal, setNominal] = useState(dimension ? String(dimension.nominal) : "");
  const [tolerance, setTolerance] = useState(dimension ? String(dimension.tolerance) : "");
  const [error, setError] = useState<string | null>(null);

  const nominalNum = parseCell(nominal);
  const toleranceNum = parseCell(tolerance);
  const previewOk = nominalNum !== null && toleranceNum !== null && toleranceNum >= 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") return setError("Nama dimensi wajib diisi");
    if (nominalNum === null) return setError("Nominal harus berupa angka");
    if (toleranceNum === null || toleranceNum < 0) {
      return setError("Toleransi harus berupa angka ≥ 0");
    }
    onSubmit({ key: dimension?.key, name: name.trim(), nominal: nominalNum, tolerance: toleranceNum });
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dimension-dialog-title"
    >
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="dimension-dialog-title" className="text-base font-semibold">
            {dimension ? "Edit Dimensi" : "Tambah Dimensi"}
          </h3>
          <button type="button" onClick={onCancel} aria-label="Tutup" className="rounded p-1 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nama Dimensi</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. 1, 2, Weight"
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Nominal</span>
              <input
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                inputMode="decimal"
                placeholder="24.5"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Toleransi (±)</span>
              <input
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
                inputMode="decimal"
                placeholder="0.2"
                className={inputClass}
              />
            </label>
          </div>
          {previewOk && (
            <p className="text-xs text-slate-600">
              LSL: <strong>{clean(nominalNum - toleranceNum)}</strong> · USL:{" "}
              <strong>{clean(nominalNum + toleranceNum)}</strong>
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mr-auto flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 size={14} /> Hapus
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className={`${onDelete ? "" : "ml-auto"} rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50`}
          >
            Batal
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {dimension ? "Terapkan" : "Tambah"}
          </button>
        </div>
      </form>
    </div>
  );
}
