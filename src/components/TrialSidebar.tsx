"use client";

import { useState, type FormEvent } from "react";
import { Copy, FilePlus2, Plus, Trash2, X } from "lucide-react";
import type { TrialListItem } from "@/lib/types";

export interface NewTrialInput {
  productName: string;
  productParts: string;
  partNumber: string;
  trialLevel: string;
  inspectionDate: string;
  cloneFromTrialId: string | null;
}

interface TrialSidebarProps {
  trials: TrialListItem[];
  selectedId: string | null;
  loading: boolean;
  /** Mengembalikan pesan error, atau null bila berhasil. */
  onCreate: (input: NewTrialInput) => Promise<string | null>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function TrialSidebar({
  trials,
  selectedId,
  loading,
  onCreate,
  onSelect,
  onDelete,
}: TrialSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"blank" | "clone">("blank");
  const [cloneId, setCloneId] = useState("");
  const [form, setForm] = useState({
    productName: "",
    productParts: "",
    partNumber: "",
    trialLevel: "",
    inspectionDate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openForm() {
    const source = trials.find((t) => t.id === selectedId) ?? trials[0];
    setCloneId(source?.id ?? "");
    setMode("blank");
    setForm({
      productName: "",
      productParts: "",
      partNumber: "",
      trialLevel: "",
      inspectionDate: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setCreating(true);
  }

  function prefillFrom(id: string) {
    const source = trials.find((t) => t.id === id);
    if (!source) return;
    setForm((f) => ({
      ...f,
      productName: source.productName,
      productParts: source.productParts,
      partNumber: source.partNumber,
    }));
  }

  function chooseMode(next: "blank" | "clone") {
    setMode(next);
    if (next === "clone" && cloneId) prefillFrom(cloneId);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await onCreate({
      ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
      cloneFromTrialId: mode === "clone" && cloneId ? cloneId : null,
    } as NewTrialInput);
    setSubmitting(false);
    if (message) setError(message);
    else setCreating(false);
  }

  async function handleDelete(trial: TrialListItem) {
    const label = `${trial.productName} – ${trial.productParts} (${trial.trialLevel})`;
    if (window.confirm(`Hapus trial "${label}" beserta seluruh datanya? Tindakan ini tidak bisa dibatalkan.`)) {
      await onDelete(trial.id);
    }
  }

  const canSubmit =
    form.productName.trim() &&
    form.productParts.trim() &&
    form.partNumber.trim() &&
    form.trialLevel.trim() &&
    form.inspectionDate.trim() &&
    (mode === "blank" || cloneId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
        <h1 className="text-sm font-bold text-slate-900">FAI &amp; Cpk Recorder</h1>
        <button
          type="button"
          onClick={() => (creating ? setCreating(false) : openForm())}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? "Tutup" : "Trial baru"}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleSubmit} className="space-y-2 border-b border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => chooseMode("blank")}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1 ${
                mode === "blank" ? "bg-white font-medium shadow-sm" : "text-slate-600"
              }`}
            >
              <FilePlus2 size={13} /> Kosong
            </button>
            <button
              type="button"
              onClick={() => chooseMode("clone")}
              disabled={trials.length === 0}
              className={`flex items-center justify-center gap-1 rounded px-2 py-1 disabled:opacity-40 ${
                mode === "clone" ? "bg-white font-medium shadow-sm" : "text-slate-600"
              }`}
            >
              <Copy size={13} /> Duplikat spesifikasi
            </button>
          </div>

          {mode === "clone" && (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-600">
                Salin dimensi (nominal ± toleransi) dari
              </span>
              <select
                value={cloneId}
                onChange={(e) => {
                  setCloneId(e.target.value);
                  prefillFrom(e.target.value);
                }}
                className={inputClass}
              >
                {trials.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.productName} – {t.productParts} ({t.trialLevel})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Angka pengukuran tidak ikut disalin.
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-600">Product Name *</span>
            <input
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="mis. Irrigation Syringe"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-600">Product Parts *</span>
            <input
              value={form.productParts}
              onChange={(e) => setForm((f) => ({ ...f, productParts: e.target.value }))}
              placeholder="mis. Luer Adapter"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-600">Part Number *</span>
            <input
              value={form.partNumber}
              onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))}
              placeholder="mis. 25-0311-0005 Rev B"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-600">Trial Level *</span>
            <input
              value={form.trialLevel}
              onChange={(e) => setForm((f) => ({ ...f, trialLevel: e.target.value }))}
              placeholder="mis. Trial Machine I1 (Parameter Target)"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-600">Inspection Date (YYYY-MM-DD) *</span>
            <input
              type="date"
              value={form.inspectionDate}
              onChange={(e) => setForm((f) => ({ ...f, inspectionDate: e.target.value }))}
              className={inputClass}
            />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Membuat…" : "Buat trial"}
          </button>
        </form>
      )}

      <ul className="flex-1 overflow-y-auto">
        {loading && trials.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">Memuat…</li>
        )}
        {!loading && trials.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">Belum ada trial. Klik “Trial baru”.</li>
        )}
        {trials.map((t) => {
          const active = t.id === selectedId;
          const { summary } = t;
          const tone =
            summary.status === "Pass"
              ? "bg-green-100 text-green-800"
              : summary.failCount > 0
                ? "bg-red-100 text-red-800"
                : "bg-slate-200 text-slate-700";
          return (
            <li key={t.id} className={`group border-b border-slate-100 ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}>
              <div className="flex items-start gap-1 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={active ? "true" : undefined}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-slate-900">{t.productName}</div>
                  <div className="truncate text-xs text-slate-600">
                    {t.productParts} · {t.partNumber}
                  </div>
                  <div className="truncate text-xs text-slate-500">{t.trialLevel}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${tone}`}>
                      {summary.passCount}/{summary.dimensionCount} Pass
                    </span>
                    {summary.pendingCount > 0 && summary.dimensionCount > 0 && (
                      <span className="text-slate-500">{summary.pendingCount} belum lengkap</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  aria-label={`Hapus trial ${t.productName} ${t.trialLevel}`}
                  title="Hapus trial"
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-700"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
