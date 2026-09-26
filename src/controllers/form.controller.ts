import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import FormModel from "../models/Form.model";
import FormSubmissionModel from "../models/FormSubmission.model";
import { Event } from "../models/Event.model";
import AppError from "../utils/AppError";
import { ApiFeatures } from "../utils/apiFeatures";
import { buildHateoas } from "../utils/hateoas";
import { deleteFromCloudinary } from "../services/upload.service";

function extractCloudinaryPublicId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;
  if (!urlOrId.startsWith("http://") && !urlOrId.startsWith("https://")) {
    return urlOrId;
  }
  try {
    const parts = urlOrId.split("/upload/");
    if (parts.length > 1) {
      let pathAfterUpload = parts[1];
      pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, "");
      const lastDot = pathAfterUpload.lastIndexOf(".");
      if (lastDot !== -1) {
        pathAfterUpload = pathAfterUpload.substring(0, lastDot);
      }
      return pathAfterUpload;
    }
  } catch (e) {
    console.warn("Failed to extract public_id from url:", urlOrId, e);
  }
  return null;
}

/**
 * Create a new form for an event or independently (Admin)
 */
export const createForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, eventId, description, startDate, endDate, fields, coverImageUrl, allowMultipleSubmissions } = req.body;

    if (!title || !fields?.length) {
      return next(new AppError("Title and fields are required", 400));
    }

    // Clean eventId: if dummy independent ID or invalid, treat as null
    const validEventId =
      eventId &&
      eventId !== "111111111111111111111111" &&
      mongoose.Types.ObjectId.isValid(eventId)
        ? eventId
        : null;

    const form = await FormModel.create({
      title,
      eventId: validEventId,
      description: description || "",
      coverImageUrl: coverImageUrl || "",
      startDate,
      endDate,
      fields,
      allowMultipleSubmissions: allowMultipleSubmissions !== false, // default true
    });

    // Two-way sync: If created with an associated event, link it to the event automatically
    if (validEventId) {
      await Event.findByIdAndUpdate(validEventId, { linkedForm: form._id });
    }

    res.status(201).json({
      success: true,
      message: "Form created successfully",
      data: form,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getAllForms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const forms = await FormModel.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: forms,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all forms for a specific event
 */

export const getFormsByEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`;

    const total = await FormModel.countDocuments({
      eventId: req.params.eventId,
    });

    const features = new ApiFeatures(FormModel.find({ eventId: req.params.eventId }), req.query)
      .filter()
      .sort()
      .paginate();

    const forms = await features["mongooseQuery"];

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    res.json({
      success: true,
      count: forms.length,
      total,
      links: buildHateoas(baseUrl, page, limit, total),
      data: forms,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single form (used before submission)
 */
export const getFormById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const form = await FormModel.findById(req.params.id);

    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    res.json({
      success: true,
      data: form,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable a form (Admin)
 */
export const disableForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const form = await FormModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    res.json({
      success: true,
      message: "Form disabled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a form permanently (Admin)
 */
export const deleteForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const form = await FormModel.findById(req.params.id);

    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    // 1. Delete cover image if uploaded to Cloudinary
    if (form.coverImageUrl) {
      const coverPubId = extractCloudinaryPublicId(form.coverImageUrl);
      if (coverPubId) {
        try {
          await deleteFromCloudinary(coverPubId);
        } catch (cErr) {
          console.warn("Failed to delete form cover image from Cloudinary:", cErr);
        }
      }
    }

    // 2. Find all responses and delete any uploaded media files
    const submissions = await FormSubmissionModel.find({ formId: form._id });
    for (const sub of submissions) {
      if (sub.responses) {
        for (const val of Object.values(sub.responses)) {
          if (typeof val === "string") {
            const pubId = extractCloudinaryPublicId(val);
            if (pubId) {
              try {
                await deleteFromCloudinary(pubId);
              } catch (fErr) {
                console.warn("Failed to delete submission file from Cloudinary:", fErr);
              }
            }
          } else if (val && typeof val === "object") {
            const obj = val as Record<string, any>;
            const pubId = obj.public_id || (obj.url ? extractCloudinaryPublicId(obj.url) : null);
            if (pubId) {
              try {
                await deleteFromCloudinary(pubId);
              } catch (fErr) {
                console.warn("Failed to delete submission object file from Cloudinary:", fErr);
              }
            }
          }
        }
      }
    }

    // 3. Delete all related form submissions
    await FormSubmissionModel.deleteMany({ formId: form._id });

    // 4. Two-way sync: If form was linked to an event, clear the event's linkedForm
    if (form.eventId) {
      await Event.findByIdAndUpdate(form.eventId, { $unset: { linkedForm: 1 } });
    }

    // 5. Delete form document
    await FormModel.findByIdAndDelete(form._id);

    res.json({
      success: true,
      message: "Form and all its related responses & media deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing form (Admin)
 */
export const updateForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, eventId, description, startDate, endDate, fields, coverImageUrl, allowMultipleSubmissions, isActive } = req.body;

    const existingForm = await FormModel.findById(req.params.id);
    if (!existingForm) {
      return next(new AppError("Form not found", 404));
    }

    const validEventId =
      eventId !== undefined
        ? eventId &&
          eventId !== "111111111111111111111111" &&
          mongoose.Types.ObjectId.isValid(eventId)
          ? eventId
          : null
        : existingForm.eventId;

    const oldEventId = existingForm.eventId ? existingForm.eventId.toString() : null;
    const newEventId = validEventId ? validEventId.toString() : null;

    if (title !== undefined) existingForm.title = title;
    existingForm.eventId = validEventId as any;
    if (description !== undefined) existingForm.description = description;
    if (coverImageUrl !== undefined) existingForm.coverImageUrl = coverImageUrl;
    if (startDate !== undefined) existingForm.startDate = startDate;
    if (endDate !== undefined) existingForm.endDate = endDate;
    if (fields !== undefined) existingForm.fields = fields;
    if (allowMultipleSubmissions !== undefined) existingForm.allowMultipleSubmissions = allowMultipleSubmissions;
    if (isActive !== undefined) existingForm.isActive = isActive;

    await existingForm.save();

    // Two-way sync: Handle event change or unlinking
    if (oldEventId && oldEventId !== newEventId) {
      // Unlink previous event
      await Event.findByIdAndUpdate(oldEventId, { $unset: { linkedForm: 1 } });
    }
    if (newEventId && oldEventId !== newEventId) {
      // Link new event
      await Event.findByIdAndUpdate(newEventId, { linkedForm: existingForm._id });
    }

    res.json({
      success: true,
      message: "Form updated successfully",
      data: existingForm,
    });
  } catch (error) {
    next(error);
  }
};
