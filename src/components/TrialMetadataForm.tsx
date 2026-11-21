"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  Settings,
} from "lucide-react";
import type { Draft, MetaKey } from "@/lib/draft";

interface TrialMetadataFormProps {
  draft: Draft;
  onMetaChange: (key: MetaKey, value: string) => void;
  onCpkThresholdChange: (value: number) => void;
  onMachineSettingsChange: (notes: string) => void;
}

const PRESET_CPK = [1.0, 1.33, 1.67];

/**
 * Komponen input tanggal cerdas:
 * Jika formatnya YYYY-MM-DD atau kosong -> tampilkan input type="date".
 * Jika data lama teks (mis. "July 1th, 2026") -> tampilkan input text dengan opsi switch ke kalender.
 */
function SmartDateInput({
  label,
  value,
  onChange,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  className: string;
}) {
  const isIsoDate = value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const [useTextInput, setUseTextInput] = useState(!isIsoDate);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      setUseTextInput(false);
    }
  }, [value]);

  function convertToIso() {
    // Coba parse teks tanggal (misal "July 1th, 2026" atau "June 30th, 2026")
    const cleaned = value.replace(/(\d+)(st|nd|rd|th)/i, "$1");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().slice(0, 10);
      onChange(iso);
      setUseTextInput(false);
    } else {
      // Default ke hari ini jika tidak bisa di-parse
      onChange(new Date().toISOString().slice(0, 10));
      setUseTextInput(false);
    }
  }

  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-600">
          {label} {required ? "*" : ""}
        </span>
        {useTextInput ? (
          <button
            type="button"
            onClick={convertToIso}
            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
            title="Ubah format ke kalender YYYY-MM-DD"
          >
            <Calendar size={12} />
            <span>Gunakan Kalender</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setUseTextInput(true)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
            title="Edit sebagai teks bebas"
          >
            <FileText size={12} />
            <span>Teks Bebas</span>
          </button>
        )}
      </div>

      {useTextInput ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="mis. July 1th, 2026 atau YYYY-MM-DD"
          className={className}
        />
      ) : (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

export default function TrialMetadataForm({
  draft,
  onMetaChange,
  onCpkThresholdChange,
  onMachineSettingsChange,
}: TrialMetadataFormProps) {
  // Default collapsed: true agar area grid langsung luas saat halaman dibuka
  const [collapsed, setCollapsed] = useState(true);
  const isCustomCpk = !PRESET_CPK.includes(draft.cpkThreshold);

  const inputClass =
    "w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-2xs print:border-0 print:shadow-none">
      {/* Header bar: saat collapsed tampil ringkasan singkat agar hemat ruang */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 print:hidden">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 rounded px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
        >
          <Settings size={14} className="text-slate-500" />
          <span>Informasi Trial &amp; Settingan Mesin</span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {/* Ringkasan Singkat Saat Tertutup (Nama Produk, Part Number, Trial Level, Target Cpk) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-800">
            <span className="font-bold text-slate-900">
              {draft.meta.productName || "–"}
            </span>
            {draft.meta.productParts && (
              <span className="text-slate-500">({draft.meta.productParts})</span>
            )}
          </div>

          <span className="text-slate-300">|</span>

          <span className="text-slate-600 font-mono text-[11px]">
            {draft.meta.partNumber || "–"}
          </span>

          <span className="text-slate-300">|</span>

          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {draft.meta.trialLevel || "–"}
          </span>

          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
            Target Cpk ≥ {draft.cpkThreshold.toFixed(2)}
          </span>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-[11px] font-medium text-blue-600 hover:underline ml-1"
          >
            {collapsed ? "Ubah / Detail" : "Tutup"}
          </button>
        </div>
      </div>

      {/* Screen Form Content (hanya tampil jika tidak di-collapse) */}
      <div className={`${collapsed ? "hidden" : "block"} p-4 space-y-4 print:hidden`}>
        {/* Section 1: Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Product Name *</span>
            <input
              type="text"
              value={draft.meta.productName}
              onChange={(e) => onMetaChange("productName", e.target.value)}
              placeholder="mis. Irrigation/Piston Syringe"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Product Parts *</span>
            <input
              type="text"
              value={draft.meta.productParts}
              onChange={(e) => onMetaChange("productParts", e.target.value)}
              placeholder="mis. Luer Adapter"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Part Number *</span>
            <input
              type="text"
              value={draft.meta.partNumber}
              onChange={(e) => onMetaChange("partNumber", e.target.value)}
              placeholder="mis. 25-0311-0005 Rev B"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Supplier / Mold Maker</span>
            <input
              type="text"
              value={draft.meta.supplier}
              onChange={(e) => onMetaChange("supplier", e.target.value)}
              placeholder="mis. Zhejiang SOL Millenium"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Material</span>
            <input
              type="text"
              value={draft.meta.material}
              onChange={(e) => onMetaChange("material", e.target.value)}
              placeholder="mis. PP SCGC P951J"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Measuring Tool / Alat Ukur</span>
            <input
              type="text"
              value={draft.meta.measuringTool}
              onChange={(e) => onMetaChange("measuringTool", e.target.value)}
              placeholder="mis. Digital Caliper Mitutoyo (ID:25E020)"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Operator / Measured By</span>
            <input
              type="text"
              value={draft.meta.measuredBy}
              onChange={(e) => onMetaChange("measuredBy", e.target.value)}
              placeholder="mis. Vina (RND) & Linda (QA)"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Trial Level *</span>
            <input
              type="text"
              value={draft.meta.trialLevel}
              onChange={(e) => onMetaChange("trialLevel", e.target.value)}
              placeholder="mis. Trial Machine I1 (Parameter Target)"
              className={inputClass}
            />
          </label>

          {/* Smart Date Inputs */}
          <SmartDateInput
            label="Inspection Date"
            required
            value={draft.meta.inspectionDate}
            onChange={(val) => onMetaChange("inspectionDate", val)}
            className={inputClass}
          />

          <SmartDateInput
            label="Received Date"
            value={draft.meta.receivedDate ?? ""}
            onChange={(val) => onMetaChange("receivedDate", val)}
            className={inputClass}
          />

          <label className="block">
            <span className="mb-1 block font-medium text-slate-600">Sample Quantity</span>
            <input
              type="text"
              value={draft.meta.sampleQty ?? ""}
              onChange={(e) => onMetaChange("sampleQty", e.target.value)}
              placeholder="mis. 1 shot 8 cavities"
              className={inputClass}
            />
          </label>

          {/* Target Cpk */}
          <div className="block">
            <span className="mb-1 block font-medium text-slate-600">Target Cpk</span>
            <div className="flex flex-wrap items-center gap-1">
              {PRESET_CPK.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onCpkThresholdChange(val)}
                  className={`rounded px-2 py-1 text-xs font-semibold transition ${
                    draft.cpkThreshold === val
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {val.toFixed(2)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  if (!isCustomCpk) onCpkThresholdChange(1.5);
                }}
                className={`rounded px-2 py-1 text-xs font-semibold transition ${
                  isCustomCpk
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Custom
              </button>

              {isCustomCpk && (
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="10.0"
                  value={draft.cpkThreshold}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) onCpkThresholdChange(v);
                  }}
                  className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-center font-bold text-blue-700 outline-none focus:border-blue-500"
                />
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Machine Settings Textarea */}
        <div className="border-t border-slate-100 pt-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">
              Parameter Settingan Mesin (Suhu, Pressure, Cooling Time, dll.)
            </span>
            <textarea
              rows={3}
              value={draft.machine.notes}
              onChange={(e) => onMachineSettingsChange(e.target.value)}
              placeholder="Contoh:&#10;Suhu Barrel: Zone 1: 190°C, Zone 2: 200°C, Nozzle: 210°C&#10;Injection Pressure: 85 bar, Speed: 40 mm/s | Holding Pressure: 60 bar (3s) | Cooling Time: 12s, Mold Temp: 30°C"
              className="w-full rounded border border-slate-300 bg-white p-2 text-xs font-mono text-slate-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Print-Only Header (Professional Report Styling) */}
      <div className="hidden print:block text-black p-2 mb-2 border-b-2 border-slate-800">
        <h1 className="text-base font-bold text-center tracking-wide uppercase mb-2">
          First Article Inspection (FAI) Report
        </h1>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] border border-slate-400 p-2 bg-slate-50">
          <div>
            <span className="font-semibold text-slate-700">Product Name:</span>{" "}
            {draft.meta.productName || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Mold Maker / Supplier:</span>{" "}
            {draft.meta.supplier || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Product Parts:</span>{" "}
            {draft.meta.productParts || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Material:</span>{" "}
            {draft.meta.material || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Part Number:</span>{" "}
            {draft.meta.partNumber || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Measuring Tool:</span>{" "}
            {draft.meta.measuringTool || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Trial Level:</span>{" "}
            {draft.meta.trialLevel || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Operator / Measured By:</span>{" "}
            {draft.meta.measuredBy || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Inspection Date:</span>{" "}
            {draft.meta.inspectionDate || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Sample Quantity:</span>{" "}
            {draft.meta.sampleQty || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Received Date:</span>{" "}
            {draft.meta.receivedDate || "–"}
          </div>
          <div>
            <span className="font-semibold text-slate-700">Target Cpk:</span>{" "}
            <strong>{draft.cpkThreshold.toFixed(2)}</strong>
          </div>
          {draft.machine.notes && (
            <div className="col-span-2 mt-1 pt-1 border-t border-slate-300">
              <span className="font-semibold text-slate-700">Machine Settings:</span>{" "}
              <span className="font-mono">{draft.machine.notes}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
