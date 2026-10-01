import { Request, Response, NextFunction } from "express";
import { CoverPresetModel } from "../models/CoverPreset.model";
import { uploadToCloudinary, moveToTrashInCloudinary } from "../services/upload.service";

/**
 * @desc Get all dynamic cover presets
 * @route GET /api/cover-presets
 * @access Public
 */
export const getCoverPresets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presets = await CoverPresetModel.find()
      .populate("uploadedBy", "fullName studentId imageUrl")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: presets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Create/upload a new cover preset
 * @route POST /api/cover-presets
 * @access Admin, Moderator
 */
export const createCoverPreset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { name, category, description, url: directUrl } = req.body;

    if (!name || (!req.file && !directUrl)) {
      return res.status(400).json({
        success: false,
        message: "Preset name and an image file or URL are required.",
      });
    }

    let finalUrl = directUrl || "";
    let finalPublicId = "";

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file);
      finalUrl = uploadResult.url || uploadResult.secure_url || (req.file as any).path;
      finalPublicId = uploadResult.public_id || (req.file as any).filename;
    }

    const preset = await CoverPresetModel.create({
      name: name.trim(),
      category: (category || "Community").trim(),
      url: finalUrl,
      publicId: finalPublicId,
      description: (description || "").trim(),
      uploadedBy: user?.id || null,
      isDefault: false,
    });

    return res.status(201).json({
      success: true,
      message: "Cover preset uploaded successfully.",
      data: preset,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete a cover preset
 * @route DELETE /api/cover-presets/:id
 * @access Admin, Moderator
 */
export const deleteCoverPreset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const preset = await CoverPresetModel.findById(id);

    if (!preset) {
      return res.status(404).json({
        success: false,
        message: "Cover preset not found.",
      });
    }

    // Move associated image to trash_to_delete folder in Cloudinary
    if (preset.publicId) {
      try {
        await moveToTrashInCloudinary(preset.publicId);
      } catch (err) {
        console.warn("Could not move preset image to trash_to_delete:", err);
      }
    }

    await CoverPresetModel.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Cover preset deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
