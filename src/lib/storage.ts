import { randomUUID } from "node:crypto";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ImageUploadError extends Error {}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new ImageUploadError("Please choose a JPG, PNG, or WebP image.");
  const contentType = match[1].toLowerCase();
  if (!allowedTypes.has(contentType)) throw new ImageUploadError("Unsupported image type.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ImageUploadError("Images must be smaller than 5 MB.");
  return { contentType, buffer };
}

export async function uploadImageDataUrl(dataUrl: string) {
  const { contentType, buffer } = parseDataUrl(dataUrl);
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "lostmate-images";
  if (!supabaseUrl || !serviceRoleKey) return { url: null, persisted: false as const };

  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const path = `reports/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: buffer,
  });
  if (!response.ok) throw new ImageUploadError("Image upload failed. You can submit the report without the photo.");
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`,
    persisted: true as const,
  };
}
