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
 * Normalizes uploaded file metadata to ensure web-accessible URLs
 * whether uploaded to Cloudinary or stored on the hosting server's public filesystem.
 */
export const uploadToCloudinary = async (file: Express.Multer.File): Promise<IUploadResult> => {
  const fileData = file as any;

  let publicUrl = fileData.secure_url || fileData.url || "";
  if (!publicUrl || (!publicUrl.startsWith("http://") && !publicUrl.startsWith("https://") && !publicUrl.startsWith("/public/"))) {
    if (fileData.path) {
      const cwd = process.cwd();
      const relative = path.relative(path.join(cwd, "public"), fileData.path).replace(/\\/g, "/");
      publicUrl = `/public/${relative.startsWith("/") ? relative.slice(1) : relative}`;
    }
  }

  return {
    asset_id: fileData.asset_id || fileData.filename || "",
    public_id: fileData.public_id || fileData.filename || "",
    url: publicUrl || fileData.path || "",
    secure_url: publicUrl || fileData.path || "",
    original_filename: file.originalname,
    bytes: file.size,
    format: fileData.format || path.extname(file.originalname).replace(".", "") || "jpg",
  };
};

/**
 * Deletes an image from Cloudinary or local disk
 */
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  if (!publicId) return;

  // Check if it's a local file in public/uploads
  if (publicId.includes("/") || publicId.includes("\\")) {
    const localPath = path.join(process.cwd(), "public", publicId.replace(/^\/?public\//, ""));
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

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== "ok" && result.result !== "not_found") {
      throw new Error(`Cloudinary returned: ${result.result}`);
    }
  } catch (error: any) {
    console.error("Cloudinary deletion failed:", error);
    throw new Error(`Cloudinary deletion failed: ${error.message}`);
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

