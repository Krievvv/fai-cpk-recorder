import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HttpError,
  handleError,
  parseDimensionCreates,
  parseTrialFields,
  readJson,
  summarizeTrial,
  trialDetailInclude,
} from "@/lib/trials";

export async function GET() {
  try {
    const trials = await prisma.trial.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        dimensions: {
          select: {
            nominal: true,
            tolerance: true,
            measurements: { select: { value: true } },
          },
        },
      },
    });

    const data = trials.map(({ dimensions, ...trial }) => ({
      ...trial,
      summary: summarizeTrial({ cpkThreshold: trial.cpkThreshold, dimensions }),
    }));

    return NextResponse.json(data);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const fields = parseTrialFields(body, "create");

    const cloneFromTrialId = body.cloneFromTrialId;
    let dimensions: {
      name: string;
      nominal: number;
      tolerance: number;
      orderIndex: number;
    }[];

    if (cloneFromTrialId !== undefined && cloneFromTrialId !== null) {
      if (typeof cloneFromTrialId !== "string" || cloneFromTrialId === "") {
        throw new HttpError(400, `Field "cloneFromTrialId" harus berupa teks yang tidak kosong`);
      }
      if (body.dimensions !== undefined) {
        throw new HttpError(
          400,
          `Gunakan salah satu: "cloneFromTrialId" atau "dimensions"`,
        );
      }

      const source = await prisma.trial.findUnique({
        where: { id: cloneFromTrialId },
        select: {
          dimensions: {
            orderBy: { orderIndex: "asc" },
            select: { name: true, nominal: true, tolerance: true, orderIndex: true },
          },
        },
      });
      if (!source) {
        throw new HttpError(404, "Trial sumber untuk clone tidak ditemukan");
      }
      // Hanya struktur dimensi (nama, nominal, toleransi); measurements tidak disalin.
      dimensions = source.dimensions;
    } else {
      dimensions = parseDimensionCreates(body.dimensions ?? [], "dimensions").map(
        (d, i) => ({ ...d, orderIndex: d.orderIndex ?? i }),
      );
    }

    const trial = await prisma.trial.create({
      data: { ...fields, dimensions: { create: dimensions } },
      include: trialDetailInclude,
    });

    return NextResponse.json(trial, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
