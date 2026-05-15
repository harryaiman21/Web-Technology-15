const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

function getApiKey() {
  return process.env.GOOGLE_DRIVE_API_KEY || null;
}

export function isDriveEnabled() {
  return !!getApiKey();
}

export async function downloadDriveFile(fileId) {
  const key = getApiKey();
  if (!key) {
    console.warn("[googleDrive] GOOGLE_DRIVE_API_KEY not set — skipping download");
    return null;
  }
  if (!fileId || typeof fileId !== "string") {
    console.warn("[googleDrive] downloadDriveFile called with invalid fileId");
    return null;
  }

  try {
    const metaUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&key=${key}`;
    const metaRes = await fetch(metaUrl);
    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => "");
      console.error(`[googleDrive] metadata fetch failed for ${fileId}: ${metaRes.status} ${text.slice(0, 200)}`);
      return null;
    }
    const meta = await metaRes.json();

    const downloadUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&key=${key}`;
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      const text = await fileRes.text().catch(() => "");
      console.error(`[googleDrive] download failed for ${fileId}: ${fileRes.status} ${text.slice(0, 200)}`);
      return null;
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      mimetype: meta.mimeType || "application/octet-stream",
      name: meta.name || `drive_${fileId}`,
      size: buffer.length,
    };
  } catch (err) {
    console.error(`[googleDrive] downloadDriveFile error for ${fileId}:`, err.message);
    return null;
  }
}

export async function readDriveFileAsText(fileId) {
  const file = await downloadDriveFile(fileId);
  if (!file) return null;
  return file.buffer.toString("utf-8");
}

export async function listDriveFolderFiles(folderId, opts = {}) {
  const key = getApiKey();
  if (!key || !folderId) return [];

  const { pageSize = 50, mimeFilter } = opts;
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=${pageSize}&key=${key}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[googleDrive] folder list failed: ${res.status} ${text.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    let files = Array.isArray(data.files) ? data.files : [];
    if (mimeFilter) files = files.filter((f) => (f.mimeType || "").startsWith(mimeFilter));
    return files;
  } catch (err) {
    console.error("[googleDrive] listDriveFolderFiles error:", err.message);
    return [];
  }
}
