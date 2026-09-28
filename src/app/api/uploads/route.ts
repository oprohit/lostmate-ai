import { ImageUploadError, uploadImageDataUrl } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { dataUrl?: unknown };
    if (typeof body.dataUrl !== "string") return Response.json({ error: "Choose an image first." }, { status: 400 });
    const uploaded = await uploadImageDataUrl(body.dataUrl);
    return Response.json(uploaded, { status: uploaded.persisted ? 201 : 200 });
  } catch (error) {
    if (error instanceof ImageUploadError) return Response.json({ error: error.message }, { status: 400 });
    console.error("upload failed", error);
    return Response.json({ error: "Image upload failed. You can submit without the photo." }, { status: 502 });
  }
}
