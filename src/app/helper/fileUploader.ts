import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import type { MultipartFile } from "@fastify/multipart";

// ── Ensure uploads folder exists ───────────────────────────────────────────────

const uploadPath = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// ── Cloudinary config ──────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// ── Allowed mime types ─────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

export interface CloudinaryResult {
  public_id: string;
  secure_url: string;
  url: string;
  format: string;
  resource_type: string;
  bytes: number;
  width?: number;
  height?: number;
}

// ── Read multipart file into buffer with better MIME detection ───────────────
export const readFileBuffer = async (
  file: MultipartFile,
): Promise<UploadedFile> => {
  const buffer = await file.toBuffer();
  let mimetype = file.mimetype;
  const filename = file.filename;

  // Enhanced octet-stream handling
  if (mimetype === "application/octet-stream" || !mimetype) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const extToMime: Record<string, string> = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "webp": "image/webp",
      "gif": "image/gif",
      "pdf": "application/pdf",
    };
    mimetype = extToMime[ext || ""] || mimetype;
  }

  // Final validation
  if (!ALLOWED_TYPES.includes(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  return { buffer, mimetype, filename };
};

export const verifyCloudinary = async (): Promise<void> => {
  await cloudinary.api.ping();
};

// ── Upload buffer to Cloudinary ────────────────────────────────────────────────
export const uploadToCloudinary = async (
  file: UploadedFile,
  folder: string = "uploads",
): Promise<CloudinaryResult> => {
  return new Promise((resolve, reject) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const publicId = file.filename.split(".")[0] ?? `upload-${uniqueSuffix}`;
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    cloudinary.uploader.upload(
      base64,
      {
        public_id: publicId,
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error || !result) {
          console.error("Cloudinary Upload Error:", error);
          return reject(error ?? new Error("Cloudinary upload failed"));
        }
        resolve(result as CloudinaryResult);
      },
    );
  });
};

// ── Delete from Cloudinary ─────────────────────────────────────────────────────
export const deleteFromCloudinary = async (
  publicId: string,
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};

// ── Save to disk ───────────────────────────────────────────────────────────────
export const saveToDisk = async (
  file: UploadedFile,
  filename?: string,
): Promise<string> => {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(file.filename);
  const finalName = filename ?? `upload-${uniqueSuffix}${ext}`;
  const filePath = path.join(uploadPath, finalName);

  await fs.promises.writeFile(filePath, file.buffer);

  return filePath;
};

// ── Export ─────────────────────────────────────────────────────────────────────
export const fileUploader = {
  readFileBuffer,
  uploadToCloudinary,
  deleteFromCloudinary,
  saveToDisk,
};