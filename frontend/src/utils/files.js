import { Attachment } from "../constants/constants";
import { Environment } from "../constants/environment";

/** Where the browser loads a receipt file from (the session cookie goes along, so it stays private) */
export function attachmentUrl(expenseId, attachmentId) {
  return `${Environment.BACKEND_URL}/expenses/${expenseId}/attachments/${attachmentId}`;
}

/** 1536 → "1.5 KB" */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/**
 * Phone photos are often 4-10 MB. Redraws a photo at most PHOTO_MAX_SIDE_PX on its long side as a
 * JPEG, which keeps a bill readable at a fraction of the size. PDFs, and photos this browser can't
 * decode, are returned as they are (the backend says if it can't take them).
 * Resolves to { file, fileName }.
 */
export async function shrinkPhoto(file) {
  if (isPdf(file) || typeof createImageBitmap !== "function") return { file, fileName: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, Attachment.PHOTO_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", Attachment.PHOTO_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return { file, fileName: file.name };
    return { file: blob, fileName: file.name.replace(/\.[^.]*$/, "") + ".jpg" };
  } catch {
    return { file, fileName: file.name };
  }
}

/** Shrinks and uploads one file to an expense. Resolves to the API envelope. */
export async function uploadReceipt(api, expenseId, rawFile) {
  const { file, fileName } = await shrinkPhoto(rawFile);
  if (file.size > Attachment.MAX_BYTES) {
    return { status: "error", message: `${fileName} is over ${formatBytes(Attachment.MAX_BYTES)}` };
  }
  return api.upload(`/expenses/${expenseId}/attachments`, file, fileName);
}
