import { v2 as cloudinary } from "cloudinary";
import { IUploadResult } from "../types/upload.types";
import path from "path";
import fs from "fs";
import "../config/env";
import { isCloudinaryConfigured } from "../config/multer.config";

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Extracts the clean Cloudinary public_id from a raw public_id or full Cloudinary URL.
 */
export const extractCloudinaryPublicId = (input?: string | null): string | null => {
  if (!input || typeof input !== "string") return null;
  let trimmed = input.trim();
  if (trimmed.includes("res.cloudinary.com")) {
    const httpIdx = trimmed.indexOf("http");
    if (httpIdx !== -1) {
      trimmed = trimmed.substring(httpIdx);
    }
  }

  // If it's already a public_id (not a full HTTP/HTTPS URL)
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const clean = trimmed.replace(/^\/+/, "");
    const extIndex = clean.lastIndexOf(".");
    if (extIndex > clean.lastIndexOf("/")) {
      return clean.substring(0, extIndex);
    }
    return clean;
  }

  const uploadIndex = trimmed.indexOf("/upload/");
  if (uploadIndex === -1) return null;
  let rest = trimmed.substring(uploadIndex + "/upload/".length).split("?")[0];
  const segments = rest.split("/");

  // Skip transformations and version prefixes (e.g. v1791223582 or f_auto,q_auto)
  while (segments.length > 1) {
    const seg = segments[0];
    if (seg.startsWith("v") && /^v\d+$/.test(seg)) {
      segments.shift();
      break;
    } else if (seg.includes(",") || seg.includes("_") || /^(w|h|c|g|q|f|dpr)_/.test(seg)) {
      segments.shift();
    } else {
      break;
    }
  }

  let publicIdWithExt = segments.join("/");
  const dotIndex = publicIdWithExt.lastIndexOf(".");
  if (dotIndex !== -1) {
    publicIdWithExt = publicIdWithExt.substring(0, dotIndex);
  }
  return publicIdWithExt;
};

/**
 * Normalizes uploaded file metadata to ensure web-accessible URLs
 * whether uploaded to Cloudinary or stored on the hosting server's public filesystem.
 */
export const uploadToCloudinary = async (file: Express.Multer.File): Promise<IUploadResult> => {
  const fileData = file as any;

  // 1. Direct Cloudinary URL check (multer-storage-cloudinary sets file.path or file.secure_url)
  let publicUrl = "";
  if (typeof fileData.secure_url === "string" && fileData.secure_url.startsWith("http")) {
    publicUrl = fileData.secure_url;
  } else if (typeof fileData.url === "string" && fileData.url.startsWith("http")) {
    publicUrl = fileData.url;
  } else if (typeof fileData.path === "string" && fileData.path.startsWith("http")) {
    publicUrl = fileData.path;
  }

  // 2. Fallback for local files saved on disk in public/uploads
  if (!publicUrl) {
    if (fileData.path && typeof fileData.path === "string") {
      const cwd = process.cwd();
      const relative = path.relative(path.join(cwd, "public"), fileData.path).replace(/\\/g, "/");
      publicUrl = `/public/${relative.startsWith("/") ? relative.slice(1) : relative}`;
    }
  }

  // 3. Resolve clean public_id
  let publicId = fileData.public_id || fileData.filename || "";
  if ((!publicId || publicId.startsWith("http")) && publicUrl) {
    publicId = extractCloudinaryPublicId(publicUrl) || "";
  }

  return {
    asset_id: fileData.asset_id || publicId,
    public_id: publicId,
    url: publicUrl,
    secure_url: publicUrl,
    original_filename: file.originalname,
    bytes: file.size,
    format: fileData.format || path.extname(file.originalname).replace(".", "") || "jpg",
  };
};

/**
 * Deletes an image from Cloudinary or local disk permanently
 */
export const deleteFromCloudinary = async (publicIdOrUrl?: string | null): Promise<void> => {
  if (!publicIdOrUrl || typeof publicIdOrUrl !== "string") return;

  // Check if it's a local file in public/uploads
  if (!publicIdOrUrl.includes("res.cloudinary.com") && (publicIdOrUrl.startsWith("/public/") || publicIdOrUrl.startsWith("public/"))) {
    const localPath = path.join(process.cwd(), "public", publicIdOrUrl.replace(/^\/?public\//, ""));
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
        return;
      } catch (e) {
        console.warn("Failed to delete local upload file:", e);
      }
    }
  }

  if (!isCloudinaryConfigured()) {
    return;
  }

  const publicId = extractCloudinaryPublicId(publicIdOrUrl);
  if (!publicId) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });

    if (result.result !== "ok" && result.result !== "not_found") {
      console.warn(`Cloudinary returned: ${result.result} for ${publicId}`);
    }
  } catch (error: any) {
    console.error(`Cloudinary deletion failed for ${publicId}:`, error?.message || error);
  }
};

/**
 * Moves an asset to the trash_to_delete folder in Cloudinary instead of permanently destroying it.
 */
export const moveToTrashInCloudinary = async (publicId: string, resourceType = "image"): Promise<string | null> => {
  if (!publicId) return null;
  if (!isCloudinaryConfigured()) return null;
  try {
    const cleanName = publicId.split("/").pop() || `asset-${Date.now()}`;
    const targetFolder = publicId.startsWith("mec-cc-web/") ? "mec-cc-web/trash_to_delete" : "uploads/trash_to_delete";
    const targetPublicId = `${targetFolder}/${cleanName}-${Date.now()}`;
    const result = await cloudinary.uploader.rename(publicId, targetPublicId, {
      resource_type: resourceType as any,
      overwrite: true,
      invalidate: true,
    });
    return result.public_id;
  } catch (error: any) {
    console.warn(`Could not move ${publicId} to trash_to_delete:`, error?.message || error);
    throw new Error(`Failed to move to trash: ${error?.message || "Cloudinary error"}`);
  }
};

/**
 * Restores an asset from trash_to_delete back to its original or designated folder.
 */
export const restoreFromTrashInCloudinary = async (
  publicId: string,
  targetFolder?: string,
  resourceType = "image"
): Promise<{ restoredPublicId: string; targetFolder: string; url: string; secure_url: string }> => {
  if (!publicId) throw new Error("publicId is required to restore");
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary is not configured");

  const rawFilename = publicId.split("/").pop() || "";
  // Strip trailing -<13-digit-timestamp> added during moveToTrash
  const originalCleanName = rawFilename.replace(/-\d{13}$/, "");

  let folder = targetFolder?.trim();
  if (!folder) {
    const isMecWeb = publicId.startsWith("mec-cc-web/");
    folder = isMecWeb ? "mec-cc-web/uploads" : "uploads/misc";
  }

  // Remove leading/trailing slashes
  folder = folder.replace(/^\/+|\/+$/g, "");
  const targetPublicId = `${folder}/${originalCleanName}`;

  try {
    const result = await cloudinary.uploader.rename(publicId, targetPublicId, {
      resource_type: resourceType as any,
      overwrite: true,
      invalidate: true,
    });

    return {
      restoredPublicId: result.public_id,
      targetFolder: folder,
      url: result.url,
      secure_url: result.secure_url,
    };
  } catch (error: any) {
    console.error(`Cloudinary restore failed for ${publicId} -> ${targetPublicId}:`, error);
    throw new Error(`Cloudinary restore failed: ${error.message || error}`);
  }
};

function formatStorageBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Fetch high-level Cloudinary storage and credit statistics for dashboard display.
 */
export const getCloudinaryUsageStats = async () => {
  if (!isCloudinaryConfigured()) {
    return null;
  }
  try {
    const usage = await cloudinary.api.usage();
    const storageBytes = usage.storage?.usage || 0;
    const bandwidthBytes = usage.bandwidth?.usage || 0;
    const totalAssets = usage.objects?.usage || 0;

    const creditsUsed = usage.credits?.usage || 0;
    const creditsLimit = usage.credits?.limit || 25;
    const percentUsed = usage.credits?.used_percent || ((creditsUsed / creditsLimit) * 100);

    return {
      plan: usage.plan || "Free",
      lastUpdated: usage.last_updated || new Date().toISOString(),
      storage: {
        bytes: storageBytes,
        formatted: formatStorageBytes(storageBytes),
        credits: usage.storage?.credits_usage || 0,
      },
      bandwidth: {
        bytes: bandwidthBytes,
        formatted: formatStorageBytes(bandwidthBytes),
        credits: usage.bandwidth?.credits_usage || 0,
      },
      objects: {
        totalAssets,
      },
      credits: {
        usage: creditsUsed,
        limit: creditsLimit,
        percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
        remaining: Math.max(0, Math.round((creditsLimit - creditsUsed) * 100) / 100),
      },
    };
  } catch (err: any) {
    console.warn("Could not fetch Cloudinary usage:", err?.message || err);
    return null;
  }
};

