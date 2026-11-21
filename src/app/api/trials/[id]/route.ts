import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HttpError,
  handleError,
  isRecord,
  parseDimensionCreates,
  parseDimensionUpdates,
  parseIdList,
  parseMeasurements,
  parseTrialFields,
  readJson,
  trialDetailInclude,
} from "@/lib/trials";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const trial = await prisma.trial.findUnique({
      where: { id },
      include: trialDetailInclude,
    });
    if (!trial) throw new HttpError(404, "Trial tidak ditemukan");
    return NextResponse.json(trial);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Body (semua field opsional):
 * {
 *   ...metadata trial, machineSettings, cpkThreshold,
 *   dimensions: {
 *     add:    [{ name, nominal, tolerance, orderIndex? }],
 *     update: [{ id, name?, nominal?, tolerance?, orderIndex? }],
 *     remove: [dimensionId]
 *   },
 *   measurements: [{ dimensionId, sampleNo, value: number | null }],
 *   sampleCount: number   // measurement dengan sampleNo > sampleCount dihapus
 * }
 * `measurements` bersifat upsert per (dimensionId, sampleNo) dan hanya bisa
 * mengacu ke dimensi yang sudah ada (bukan yang baru ditambah di request yang sama).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJson(request);

    const fields = parseTrialFields(body, "update");

    let add: ReturnType<typeof parseDimensionCreates> = [];
    let update: ReturnType<typeof parseDimensionUpdates> = [];
    let remove: string[] = [];
    if (body.dimensions !== undefined) {
      if (!isRecord(body.dimensions)) {
        throw new HttpError(400, `Field "dimensions" harus berupa objek { add, update, remove }`);
      }
      if (body.dimensions.add !== undefined) {
        add = parseDimensionCreates(body.dimensions.add, "dimensions.add");
      }
      if (body.dimensions.update !== undefined) {
        update = parseDimensionUpdates(body.dimensions.update, "dimensions.update");
      }
      if (body.dimensions.remove !== undefined) {
        remove = parseIdList(body.dimensions.remove, "dimensions.remove");
      }
    }

    // Jika sampleNo/dimensi duplikat dalam satu batch, entri terakhir yang dipakai.
    const measurementMap = new Map<
      string,
      { dimensionId: string; sampleNo: number; value: number | null }
    >();
    if (body.measurements !== undefined) {
      for (const m of parseMeasurements(body.measurements, "measurements")) {
        measurementMap.set(`${m.dimensionId}:${m.sampleNo}`, m);
      }
    }
    const measurements = [...measurementMap.values()];

    let sampleCount: number | undefined;
    if (body.sampleCount !== undefined) {
      if (
        typeof body.sampleCount !== "number" ||
        !Number.isInteger(body.sampleCount) ||
        body.sampleCount < 0
      ) {
        throw new HttpError(400, `Field "sampleCount" harus berupa bilangan bulat >= 0`);
      }
      sampleCount = body.sampleCount;
    }

    await prisma.$transaction(
      async (tx) => {
        const trial = await tx.trial.findUnique({
          where: { id },
          select: {
            dimensions: { select: { id: true, orderIndex: true } },
          },
        });
        if (!trial) throw new HttpError(404, "Trial tidak ditemukan");

        const ownIds = new Set(trial.dimensions.map((d) => d.id));
        const removeIds = new Set(remove);

        for (const dimId of remove) {
          if (!ownIds.has(dimId)) {
            throw new HttpError(400, `Dimensi "${dimId}" bukan milik trial ini`);
          }
        }
        for (const u of update) {
          if (!ownIds.has(u.id) || removeIds.has(u.id)) {
            throw new HttpError(400, `Dimensi "${u.id}" tidak valid untuk diubah`);
          }
        }
        for (const m of measurements) {
          if (!ownIds.has(m.dimensionId) || removeIds.has(m.dimensionId)) {
            throw new HttpError(
              400,
              `Dimensi "${m.dimensionId}" tidak valid untuk measurements`,
            );
          }
        }

        // updatedAt selalu diperbarui, termasuk saat hanya measurements yang berubah.
        await tx.trial.update({
          where: { id },
          data: { ...fields, updatedAt: new Date() },
        });

        if (remove.length > 0) {
          await tx.dimension.deleteMany({
            where: { id: { in: remove }, trialId: id },
          });
        }

        for (const { id: dimId, ...data } of update) {
          await tx.dimension.update({ where: { id: dimId }, data });
        }

        if (add.length > 0) {
          let nextIndex =
            trial.dimensions
              .filter((d) => !removeIds.has(d.id))
              .reduce((max, d) => Math.max(max, d.orderIndex), -1) + 1;
          await tx.dimension.createMany({
            data: add.map((d) => ({
              trialId: id,
              name: d.name,
              nominal: d.nominal,
              tolerance: d.tolerance,
              orderIndex: d.orderIndex ?? nextIndex++,
            })),
          });
        }

        if (sampleCount !== undefined) {
          await tx.measurement.deleteMany({
            where: { dimension: { trialId: id }, sampleNo: { gt: sampleCount } },
          });
        }

        for (const m of measurements) {
          await tx.measurement.upsert({
            where: {
              dimensionId_sampleNo: {
                dimensionId: m.dimensionId,
                sampleNo: m.sampleNo,
              },
            },
            update: { value: m.value },
            create: m,
          });
        }
      },
      { timeout: 30_000 },
    );

    const updated = await prisma.trial.findUnique({
      where: { id },
      include: trialDetailInclude,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    // Melempar P2025 (-> 404 via handleError) jika trial tidak ada.
    await prisma.trial.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
