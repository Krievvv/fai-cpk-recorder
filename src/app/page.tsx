"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Menu,
  Printer,
  Save,
  XCircle,
} from "lucide-react";
import MeasurementGrid, { type DimensionInput } from "@/components/MeasurementGrid";
import TrialMetadataForm from "@/components/TrialMetadataForm";
import TrialSidebar, { type NewTrialInput } from "@/components/TrialSidebar";
import {
  assignServerIds,
  buildDimensionOps,
  buildMeasurementCells,
  buildMetaPayload,
  draftFromTrial,
  snapshotDraft,
  validateDraft,
  type Draft,
  type MetaKey,
} from "@/lib/draft";
import { exportDraftToXlsx } from "@/lib/exportXlsx";
import type { TrialDTO, TrialListItem } from "@/lib/types";

export default function HomePage() {
  const [trials, setTrials] = useState<TrialListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrial, setSelectedTrial] = useState<TrialDTO | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoSavedNotice, setAutoSavedNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sidebar default tertutup di HP (< lg), terbuka di Desktop (>= lg)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  // Ref untuk mengontrol timer debouncing & mencegah race condition pada auto-save
  const isSavingRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Status perubahan (tersimpan vs belum disimpan)
  const isDirty = useMemo(() => {
    if (!draft || !savedSnapshot) return false;
    return snapshotDraft(draft) !== savedSnapshot;
  }, [draft, savedSnapshot]);

  // Muat daftar trial
  const loadTrials = useCallback(async (selectIdAfterLoad?: string) => {
    try {
      setLoadingList(true);
      const res = await fetch("/api/trials");
      if (!res.ok) throw new Error("Gagal memuat daftar trial");
      const data: TrialListItem[] = await res.json();
      setTrials(data);

      if (selectIdAfterLoad) {
        setSelectedId(selectIdAfterLoad);
      } else if (data.length > 0) {
        setSelectedId((current) =>
          current && data.some((t) => t.id === current) ? current : data[0].id,
        );
      } else {
        setSelectedId(null);
        setSelectedTrial(null);
        setDraft(null);
        setSavedSnapshot("");
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Gagal memuat trial");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadTrials();
  }, [loadTrials]);

  // Muat detail trial saat selectedId berubah
  useEffect(() => {
    // Batalkan timer auto-save dari trial sebelumnya jika berganti trial
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (!selectedId) return;

    let cancelled = false;
    async function loadDetail() {
      try {
        setLoadingDetail(true);
        setErrorMessage(null);
        const res = await fetch(`/api/trials/${selectedId}`);
        if (!res.ok) throw new Error("Gagal mengambil data trial");
        const data: TrialDTO = await res.json();
        if (cancelled) return;

        setSelectedTrial(data);
        const initialDraft = draftFromTrial(data);
        setDraft(initialDraft);
        setSavedSnapshot(snapshotDraft(initialDraft));
        setAutoSavedNotice(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Gagal memuat data trial");
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [selectedId]);

  // Eksekusi penyimpanan (bisa manual atau auto-save)
  const executeSave = useCallback(
    async (trigger: "manual" | "auto" = "manual") => {
      if (isSavingRef.current || !selectedId || !draft || !selectedTrial) return;

      const validationError = validateDraft(draft);
      if (validationError) {
        if (trigger === "manual") {
          setErrorMessage(validationError);
        }
        return;
      }

      // Hapus timer debounce jika masih ada
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      isSavingRef.current = true;
      setSaving(true);
      setErrorMessage(null);

      try {
        const metaPayload = buildMetaPayload(draft);
        const dimOps = buildDimensionOps(draft, selectedTrial);

        let currentDraft = draft;
        let currentServer = selectedTrial;

        // Jika ada penambahan dimensi baru, simpan struktur dimensi terlebih dahulu
        if (dimOps.add.length > 0) {
          const res = await fetch(`/api/trials/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...metaPayload,
              dimensions: dimOps,
              sampleCount: draft.sampleCount,
            }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Gagal menambahkan dimensi");
          }

          currentServer = await res.json();
          currentDraft = assignServerIds(draft, currentServer);
          setDraft(currentDraft);
        }

        // Simpan nilai pengukuran dan metadata/dimensi update lainnya
        const measurements = buildMeasurementCells(currentDraft, currentServer);
        const remainingDimOps =
          dimOps.add.length > 0 ? { update: [], remove: [] } : dimOps;

        const res = await fetch(`/api/trials/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...metaPayload,
            dimensions: remainingDimOps,
            measurements,
            sampleCount: currentDraft.sampleCount,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Gagal menyimpan pengukuran");
        }

        const finalServer: TrialDTO = await res.json();
        setSelectedTrial(finalServer);
        const syncedDraft = draftFromTrial(finalServer);
        setDraft(syncedDraft);
        setSavedSnapshot(snapshotDraft(syncedDraft));

        if (trigger === "auto") {
          setAutoSavedNotice(true);
          setTimeout(() => setAutoSavedNotice(false), 3000);
        } else {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }

        // Refresh sidebar summary
        loadTrials();
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan",
        );
      } finally {
        isSavingRef.current = false;
        setSaving(false);
      }
    },
    [selectedId, draft, selectedTrial, loadTrials],
  );

  // Auto-Save otomatis dengan debounce 2,5 detik
  useEffect(() => {
    // Jika tidak ada perubahan atau sedang proses simpan, batalkan timer
    if (!isDirty || saving || !selectedId || !draft || !selectedTrial) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    // Reset dan pasang timer debounce 2,5 detik
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      executeSave("auto");
    }, 2500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [isDirty, saving, selectedId, draft, selectedTrial, executeSave]);

  // Handler memilih trial (dengan auto-close otomatis di layar HP)
  const handleSelectTrial = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  // Handle pembuatan trial baru (dengan auto-close di layar HP)
  async function handleCreateTrial(input: NewTrialInput): Promise<string | null> {
    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json();
        return data.error || "Gagal membuat trial";
      }

      const created: TrialDTO = await res.json();
      await loadTrials(created.id);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : "Terjadi kesalahan";
    }
  }

  // Handle hapus trial
  async function handleDeleteTrial(id: string) {
    try {
      const res = await fetch(`/api/trials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus trial");
      await loadTrials();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus trial");
    }
  }

  // Handle Export Excel (.xlsx)
  async function handleExportExcel() {
    if (!draft) return;
    try {
      await exportDraftToXlsx(draft);
    } catch (err: unknown) {
      alert("Gagal mengekspor file Excel: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Handle Print / PDF
  function handlePrint() {
    window.print();
  }

  // Handlers untuk perubahan Draft
  function handleMetaChange(key: MetaKey, value: string) {
    setDraft((prev) => (prev ? { ...prev, meta: { ...prev.meta, [key]: value } } : prev));
  }

  function handleCpkThresholdChange(value: number) {
    setDraft((prev) => (prev ? { ...prev, cpkThreshold: value } : prev));
  }

  function handleMachineSettingsChange(notes: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            machine: {
              ...prev.machine,
              notes,
            },
          }
        : prev,
    );
  }

  function handleCellChange(dimIndex: number, sampleIndex: number, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const dims = [...prev.dimensions];
      const targetDim = dims[dimIndex];
      if (!targetDim) return prev;

      const newValues = [...targetDim.values];
      newValues[sampleIndex] = value;
      dims[dimIndex] = { ...targetDim, values: newValues };

      return { ...prev, dimensions: dims };
    });
  }

  function handlePasteBlock(startSample: number, startDim: number, matrix: string[][]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const neededSamples = startSample + matrix.length;
      const newSampleCount = Math.max(prev.sampleCount, neededSamples);

      const newDimensions = prev.dimensions.map((d, colIdx) => {
        const newValues = Array.from(
          { length: newSampleCount },
          (_, i) => d.values[i] ?? "",
        );

        const pasteCol = colIdx - startDim;
        if (pasteCol >= 0) {
          for (let r = 0; r < matrix.length; r++) {
            const rowIdx = startSample + r;
            const rowData = matrix[r];
            if (pasteCol < rowData.length) {
              newValues[rowIdx] = rowData[pasteCol];
            }
          }
        }

        return { ...d, values: newValues };
      });

      return {
        ...prev,
        sampleCount: newSampleCount,
        dimensions: newDimensions,
      };
    });
  }

  function handleAddSamples(count: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const newCount = prev.sampleCount + count;
      return {
        ...prev,
        sampleCount: newCount,
        dimensions: prev.dimensions.map((d) => ({
          ...d,
          values: Array.from({ length: newCount }, (_, i) => d.values[i] ?? ""),
        })),
      };
    });
  }

  function handleRemoveLastSample() {
    setDraft((prev) => {
      if (!prev || prev.sampleCount <= 1) return prev;
      const newCount = prev.sampleCount - 1;
      return {
        ...prev,
        sampleCount: newCount,
        dimensions: prev.dimensions.map((d) => ({
          ...d,
          values: d.values.slice(0, newCount),
        })),
      };
    });
  }

  function handleSaveDimension(input: DimensionInput) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (input.key) {
        // Edit dimensi yang sudah ada
        return {
          ...prev,
          dimensions: prev.dimensions.map((d) =>
            d.key === input.key
              ? { ...d, name: input.name, nominal: input.nominal, tolerance: input.tolerance }
              : d,
          ),
        };
      } else {
        // Tambah dimensi baru
        const newDim = {
          key: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orderIndex: prev.dimensions.length,
          name: input.name,
          nominal: input.nominal,
          tolerance: input.tolerance,
          values: Array<string>(prev.sampleCount).fill(""),
        };
        return {
          ...prev,
          dimensions: [...prev.dimensions, newDim],
        };
      }
    });
  }

  function handleDeleteDimension(key: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const remaining = prev.dimensions
        .filter((d) => d.key !== key)
        .map((d, idx) => ({ ...d, orderIndex: idx }));
      return {
        ...prev,
        dimensions: remaining,
      };
    });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-900 print:h-auto print:w-auto print:overflow-visible print:bg-white relative">
      {/* Mobile Drawer Backdrop (muncul saat drawer terbuka di layar < lg) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Slide-over Drawer di Mobile (< lg), Pinned Sidebar di Desktop (>= lg) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out print:hidden
          lg:static lg:z-auto lg:h-full lg:shadow-none lg:transition-[width]
          ${
            sidebarOpen
              ? "translate-x-0 lg:w-80 lg:border-r lg:border-slate-300"
              : "-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0 lg:overflow-hidden"
          }
        `}
      >
        <TrialSidebar
          trials={trials}
          selectedId={selectedId}
          loading={loadingList}
          onCreate={handleCreateTrial}
          onSelect={handleSelectTrial}
          onDelete={handleDeleteTrial}
          onCloseMobile={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col overflow-hidden print:overflow-visible min-w-0">
        {/* Top Header & Actions Bar (responsif flex-wrap di layar HP) */}
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 print:hidden">
          {/* Sisi Kiri: Tombol Menu Drawer & Info Trial */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 transition shrink-0"
              title={sidebarOpen ? "Ciutkan Menu" : "Buka Menu Daftar Trial"}
              aria-label={sidebarOpen ? "Ciutkan Menu" : "Buka Menu Daftar Trial"}
            >
              <Menu size={20} />
            </button>

            <div className="flex flex-col min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                {draft?.meta.productName || "FAI & Cpk Recorder"}
              </h1>
              <p className="text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                {draft?.meta.productParts ? `${draft.meta.productParts} · ` : ""}
                {draft?.meta.trialLevel || "Pilih atau buat trial untuk mulai merekam pengukuran"}
              </p>
            </div>
          </div>

          {/* Sisi Kanan: Status Simpan & Tombol Aksi (flex-wrap) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Status Indicator dengan Auto-Save */}
            {saving ? (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] font-medium text-blue-700">
                <Loader2 size={12} className="animate-spin" />
                <span>Menyimpan…</span>
              </span>
            ) : autoSavedNotice ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} className="text-emerald-600" />
                <span>Tersimpan otomatis</span>
              </span>
            ) : isDirty ? (
              <span
                className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] font-medium text-amber-700 border border-amber-200"
                title="Akan tersimpan otomatis dalam 2,5 detik"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Belum disimpan</span>
              </span>
            ) : draft ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} className="text-emerald-600" />
                <span>Tersimpan</span>
              </span>
            ) : null}

            {/* Tombol Simpan Manual */}
            <button
              type="button"
              disabled={!draft || !isDirty || saving}
              onClick={() => executeSave("manual")}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40 transition"
              title="Simpan perubahan ke database sekarang"
            >
              <Save size={13} />
              <span>Simpan</span>
            </button>

            {/* Tombol Export Excel */}
            <button
              type="button"
              disabled={!draft}
              onClick={handleExportExcel}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition"
              title="Ekspor laporan FAI & Cpk ke format .xlsx"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" />
              <span>Export</span>
              <span className="hidden sm:inline">Excel</span>
            </button>

            {/* Tombol Print / PDF */}
            <button
              type="button"
              disabled={!draft}
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition"
              title="Cetak atau simpan sebagai PDF (@media print)"
            >
              <Printer size={13} className="text-slate-600" />
              <span>Print</span>
              <span className="hidden sm:inline">/ PDF</span>
            </button>
          </div>
        </header>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800 print:hidden">
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="font-medium underline hover:text-red-950"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Success toast banner (manual save) */}
        {saveSuccess && (
          <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 print:hidden">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <span>Perubahan berhasil disimpan!</span>
          </div>
        )}

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-3 print:overflow-visible print:p-0">
          {loadingDetail ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
              Memuat data trial…
            </div>
          ) : !draft ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-500 text-sm">
              <p>Belum ada trial yang dipilih.</p>
              <p className="text-xs text-slate-400 mt-1">
                Pilih trial dari menu daftar atau klik <strong>Trial baru</strong> untuk memulai.
              </p>
            </div>
          ) : (
            <>
              {/* Form Metadata & Settingan Mesin (default collapsed, ringkas di header) */}
              <TrialMetadataForm
                draft={draft}
                onMetaChange={handleMetaChange}
                onCpkThresholdChange={handleCpkThresholdChange}
                onMachineSettingsChange={handleMachineSettingsChange}
              />

              {/* Grid Pengukuran bergaya Excel */}
              <MeasurementGrid
                dimensions={draft.dimensions}
                sampleCount={draft.sampleCount}
                cpkThreshold={draft.cpkThreshold}
                onCellChange={handleCellChange}
                onPasteBlock={handlePasteBlock}
                onAddSamples={handleAddSamples}
                onRemoveLastSample={handleRemoveLastSample}
                onSaveDimension={handleSaveDimension}
                onDeleteDimension={handleDeleteDimension}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
