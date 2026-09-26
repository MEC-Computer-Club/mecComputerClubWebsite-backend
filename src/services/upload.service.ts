import { v2 as cloudinary } from "cloudinary";
import { IUploadResult } from "../types/upload.types";
import "../config/env";

// Ensure Cloudinary is configured even if multer.config.ts hasn't been imported yet
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Note: When using Multer with CloudinaryStorage, the file is
 * uploaded automatically. This helper is useful if you ever need
 * to manually upload a buffer or stream.
 */
export const uploadToCloudinary = async (file: Express.Multer.File): Promise<IUploadResult> => {
  // Since Multer-Storage-Cloudinary already uploaded the file,
  // we just format the existing data to match your interface.
  const fileData = file as any;

  return {
    asset_id: fileData.asset_id || "",
    public_id: fileData.filename || fileData.public_id,
    url: fileData.path,
    secure_url: fileData.secure_url || fileData.path,
    original_filename: file.originalname,
    bytes: file.size,
    format: fileData.format || "jpg",
  };
};

/**
 * Deletes an image from Cloudinary using its public_id
 */
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
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
