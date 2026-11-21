import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";
import { calculateCpk } from "./src/lib/cpk";

function findExcelFile(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), "dummy FAI.xlsx"),
    path.resolve(__dirname, "../dummy FAI.xlsx"),
    path.resolve(__dirname, "dummy FAI.xlsx"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("File dummy FAI.xlsx tidak ditemukan!");
}

async function runTest() {
  const filePath = findExcelFile();
  console.log(`\n======================================================`);
  console.log(`🔍 MEMULAI PENGUJIAN KALKULASI CPK VS BENCHMARK EXCEL`);
  console.log(`📁 File Excel: ${filePath}`);
  console.log(`======================================================\n`);

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["FAI OQ Luer"];
  if (!sheet) throw new Error("Sheet FAI OQ Luer tidak ditemukan!");

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  const row19 = rows[18] ?? []; // Header nama dimensi (kolom 1..10)
  const rowMin = rows[52] ?? []; // Excel baris 53 (index 52)
  const rowMax = rows[53] ?? []; // Excel baris 54 (index 53)
  const rowMean = rows[54] ?? []; // Excel baris 55 (index 54)
  const rowStdev = rows[55] ?? []; // Excel baris 56 (index 55)
  const rowCp = rows[56] ?? []; // Excel baris 57 (index 56)
  const rowCpk = rows[57] ?? []; // Excel baris 58 (index 57)
  const rowStatus = rows[58] ?? []; // Excel baris 59 (index 58)
  const rowCpU = rows[59] ?? []; // Excel baris 60 (index 59)
  const rowCpL = rows[60] ?? []; // Excel baris 61 (index 60)
  const rowUsl = rows[67] ?? []; // Excel baris 68 (index 67)
  const rowLsl = rows[68] ?? []; // Excel baris 69 (index 68)

  let totalTests = 0;
  let passedTests = 0;

  for (let c = 1; c <= 10; c++) {
    const dimName = String(row19[c] ?? "").trim();
    if (!dimName) continue;

    const usl = Number(rowUsl[c]);
    const lsl = Number(rowLsl[c]);
    const nominal = Number(((usl + lsl) / 2).toFixed(6));
    const tolerance = Number(((usl - lsl) / 2).toFixed(6));

    // Ambil 32 sampel (baris 21..52 -> index 20..51)
    const values: (number | null)[] = [];
    for (let r = 20; r <= 51; r++) {
      const v = rows[r]?.[c];
      values.push(typeof v === "number" ? v : null);
    }

    // Jalankan kalkulasi di src/lib/cpk.ts
    const result = calculateCpk(values, nominal, tolerance, 1.0);

    // Bandingkan dengan nilai formula di Excel
    const expected = {
      count: 32,
      min: Number(rowMin[c]),
      max: Number(rowMax[c]),
      mean: Number(rowMean[c]),
      stdev: Number(rowStdev[c]),
      cp: Number(rowCp[c]),
      cpk: Number(rowCpk[c]),
      status: String(rowStatus[c]).trim(),
      cpU: Number(rowCpU[c]),
      cpL: Number(rowCpL[c]),
    };

    console.log(`\n------------------------------------------------------`);
    console.log(`📌 Dimensi "${dimName}" (Nominal: ${nominal} ± ${tolerance})`);
    console.log(`------------------------------------------------------`);
    console.log(`Metric      | Excel (Target)     | App (calculateCpk) | Selisih     | Status`);
    console.log(`------------|--------------------|--------------------|-------------|-------`);

    const metrics: [string, number | string | null, number | string | null][] = [
      ["Jumlah (n)", expected.count, result.count],
      ["MIN", expected.min, result.min],
      ["MAX", expected.max, result.max],
      ["x̄ (mean)", expected.mean, result.mean],
      ["s (stdev)", expected.stdev, result.stdev],
      ["Cp", expected.cp, result.cp],
      ["Cpk", expected.cpk, result.cpk],
      ["CpU", expected.cpU, result.cpU],
      ["CpL", expected.cpL, result.cpL],
      ["Status", expected.status, result.status],
    ];

    for (const [name, expVal, actVal] of metrics) {
      totalTests++;
      let ok = false;
      let diffStr = "0";

      if (typeof expVal === "number" && typeof actVal === "number") {
        const diff = Math.abs(expVal - actVal);
        diffStr = diff.toExponential(2);
        ok = diff < 1e-6; // Toleransi floating-point sangat ketat
      } else {
        ok = String(expVal) === String(actVal);
        diffStr = "-";
      }

      if (ok) passedTests++;

      const expStr = typeof expVal === "number" ? expVal.toFixed(6) : String(expVal);
      const actStr = typeof actVal === "number" ? actVal.toFixed(6) : String(actVal);

      console.log(
        `${name.padEnd(11)} | ${expStr.padEnd(18)} | ${actStr.padEnd(18)} | ${diffStr.padEnd(11)} | ${ok ? "✅ PASS" : "❌ FAIL"}`
      );
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 HASIL PENGUJIAN: ${passedTests} / ${totalTests} pengujian lolos (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  if (passedTests === totalTests) {
    console.log(`🎉 SEMUA KALKULASI 100% PERSIS DENGAN HASIL FORMULA EXCEL!`);
  } else {
    console.log(`⚠️ Ada ${totalTests - passedTests} nilai yang tidak sesuai.`);
  }
  console.log(`======================================================\n`);
}

runTest().catch(console.error);
