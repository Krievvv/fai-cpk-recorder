import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const SEED_TRIAL_ID = "seed-luer-adapter-trial-1";

function findExcelFile(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), "dummy FAI.xlsx"),
    path.resolve(__dirname, "../dummy FAI.xlsx"),
    path.resolve(__dirname, "../../dummy FAI.xlsx"),
    path.resolve(__dirname, "dummy FAI.xlsx"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("File dummy FAI.xlsx tidak ditemukan!");
}

function cleanMetaValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  if (str.startsWith(":")) {
    str = str.replace(/^:\s*/, "");
  }
  return str.trim();
}

async function main() {
  const filePath = findExcelFile();
  console.log(`Membaca data dari: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = "FAI OQ Luer";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan dalam workbook!`);
  }

  // Ambil semua data sebagai array of rows (0-indexed)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  // Metadata baris 6-16 (Excel baris 6 = index 5, dst)
  const productName = cleanMetaValue(rows[5]?.[2]) || "Irrigation/Piston Syringe";
  const productParts = cleanMetaValue(rows[6]?.[2]) || "Luer Adapter";
  const partNumber = cleanMetaValue(rows[7]?.[2]) || "25-0311-0005 Rev B";
  const supplier = cleanMetaValue(rows[8]?.[2]) || "Zhejiang SOL Millenium";
  const receivedDate = cleanMetaValue(rows[9]?.[2]) || "June 30th, 2026";
  const inspectionDate = cleanMetaValue(rows[10]?.[2]) || "July 1th, 2026";
  const sampleQty = cleanMetaValue(rows[11]?.[2]) || "1 shot 8 cavities";
  const trialLevel = cleanMetaValue(rows[12]?.[2]) || "Trial Machine I1 (Parameter Target)";
  const material = cleanMetaValue(rows[13]?.[2]) || "PP SCGC P951J";
  const measuringTool = cleanMetaValue(rows[14]?.[2]) || "Digital Caliper Mitutoyo (ID:25E020)";
  const measuredBy = cleanMetaValue(rows[15]?.[2]) || "Vina (RND) & Linda (QA)";

  // Dimensi: Baris 19 (index 18) = Header kolom
  // Kolom 1..10 berisi dimensi "1" sampai "9" dan "Weight"
  const row19 = rows[18] ?? [];
  // Baris USL (baris 68 -> index 67), Baris LSL (baris 69 -> index 68)
  const rowUsl = rows[67] ?? [];
  const rowLsl = rows[68] ?? [];

  const dimensionsData: {
    orderIndex: number;
    name: string;
    nominal: number;
    tolerance: number;
    values: (number | null)[];
  }[] = [];

  for (let c = 1; c <= 10; c++) {
    const dimName = String(row19[c] ?? "").trim();
    if (!dimName) continue;

    const rawUsl = Number(rowUsl[c]);
    const rawLsl = Number(rowLsl[c]);
    const usl = Number.isFinite(rawUsl) ? rawUsl : 0;
    const lsl = Number.isFinite(rawLsl) ? rawLsl : 0;

    const nominal = Number(((usl + lsl) / 2).toFixed(6));
    const tolerance = Number(((usl - lsl) / 2).toFixed(6));

    // Sampel baris 21-52 (index 20-51)
    const values: (number | null)[][] = [];
    for (let r = 20; r <= 51; r++) {
      const val = rows[r]?.[c];
      if (typeof val === "number" && Number.isFinite(val)) {
        values.push([val]);
      } else if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) {
        values.push([Number(val)]);
      } else {
        values.push([null]);
      }
    }

    dimensionsData.push({
      orderIndex: c - 1,
      name: dimName,
      nominal,
      tolerance,
      values: values.map((v) => v[0]),
    });
  }

  // Idempotent: hapus trial seed sebelumnya
  await prisma.trial.deleteMany({ where: { id: SEED_TRIAL_ID } });

  const trial = await prisma.trial.create({
    data: {
      id: SEED_TRIAL_ID,
      productName,
      productParts,
      partNumber,
      supplier,
      receivedDate,
      inspectionDate,
      sampleQty,
      trialLevel,
      material,
      measuringTool,
      measuredBy,
      cpkThreshold: 1.0,
      dimensions: {
        create: dimensionsData.map((d) => ({
          orderIndex: d.orderIndex,
          name: d.name,
          nominal: d.nominal,
          tolerance: d.tolerance,
          measurements: {
            create: d.values.map((value, i) => ({
              sampleNo: i + 1,
              value,
            })),
          },
        })),
      },
    },
    include: {
      dimensions: {
        include: {
          _count: { select: { measurements: true } },
        },
      },
    },
  });

  console.log(
    `Seeded trial "${trial.productName} - ${trial.productParts}" (${trial.id}) ` +
      `dengan ${trial.dimensions.length} dimensi x ${trial.dimensions[0]?._count.measurements ?? 0} sampel.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
