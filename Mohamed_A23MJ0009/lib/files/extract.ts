import { extractPdfText } from "./pdf";
import { extractDocxText } from "./docx";
import { createWorker } from "tesseract.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FileType } from "@/types/database";

const OCR_WORKER_TIMEOUT_MS = 90_000;
const OCR_RECOGNITION_TIMEOUT_MS = 120_000;
const TESSDATA_DIR = path.join(process.cwd(), "public", "tessdata");
const TESSDATA_FILE = "eng.traineddata.gz";
const TESSERACT_CACHE_DIR = path.join(os.tmpdir(), "dhl-project-tesseract");

function logOcr(message: string, details?: unknown) {
  if (details) {
    console.log(`[OCR] ${message}`, details);
    return;
  }

  console.log(`[OCR] ${message}`);
}

function getTessdataPath() {
  const configuredPath = process.env.TESSERACT_LANG_PATH;
  const tessdataPath = configuredPath
    ? path.resolve(configuredPath)
    : TESSDATA_DIR;
  const trainedDataPath = path.join(tessdataPath, TESSDATA_FILE);

  if (!fs.existsSync(trainedDataPath)) {
    throw new Error(
      `OCR language data missing at ${trainedDataPath}. Expected ${TESSDATA_FILE}.`,
    );
  }

  return tessdataPath;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function extractText(
  buffer: Buffer,
  fileType: FileType,
): Promise<string> {
  switch (fileType) {
    case "pdf":
      return extractPdfText(buffer);

    case "docx":
      return extractDocxText(buffer);

    case "text":
      return buffer.toString("utf-8");

    case "image": {
      let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
      const startedAt = Date.now();
      const langPath = getTessdataPath();
      fs.mkdirSync(TESSERACT_CACHE_DIR, { recursive: true });

      try {
        logOcr("before createWorker", {
          bufferBytes: buffer.byteLength,
          langPath,
          cachePath: TESSERACT_CACHE_DIR,
        });

        worker = await withTimeout(
          createWorker("eng", 1, {
            cacheMethod: "none",
            cachePath: TESSERACT_CACHE_DIR,
            gzip: true,
            langPath,
            logger: (message) => logOcr("tesseract progress", message),
            errorHandler: (error) =>
              console.error("[OCR] tesseract worker error", error),
          }),
          OCR_WORKER_TIMEOUT_MS,
          "OCR worker timeout",
        );

        logOcr("after createWorker", {
          elapsedMs: Date.now() - startedAt,
        });

        logOcr("before recognize");

        const result = await withTimeout(
          worker.recognize(buffer),
          OCR_RECOGNITION_TIMEOUT_MS,
          "OCR recognition timeout",
        );

        logOcr("after recognize", {
          elapsedMs: Date.now() - startedAt,
          textLength: result.data.text.length,
        });

        return result.data.text;
      } catch (error) {
        console.error("[OCR] failed", error);
        throw error;
      } finally {
        if (worker) {
          logOcr("worker terminate start");
          await worker.terminate();
          logOcr("worker terminate complete");
        }
      }
    }

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

const ALLOWED_TYPES: Record<string, FileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/plain": "text",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/bmp": "image",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateFile(file: File): {
  fileType: FileType;
  error?: string;
} {
  const fileType = ALLOWED_TYPES[file.type];

  if (!fileType) {
    return {
      fileType: "text",
      error: "Only TXT, PDF, DOCX, and image files are supported",
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { fileType, error: "File size must be under 10 MB" };
  }

  return { fileType };
}
