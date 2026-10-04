import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import FormModel, { isFormClosed } from "../models/Form.model";
import FormSubmissionModel from "../models/FormSubmission.model";
import UserModel from "../models/User.model";
import { deleteFromCloudinary } from "../services/upload.service";
import AppError from "../utils/AppError";
import { extractApplicantDetails } from "./event.controller";

declare global {
  namespace Express {
    interface Request {
      user?: { _id: string; [key: string]: any };
    }
  }
}

/**
 * Submit a form
 */
export const submitForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { formId } = req.params;
    const { responses } = req.body;

    const isObjectId = mongoose.Types.ObjectId.isValid(formId);
    const form = isObjectId
      ? await FormModel.findOne({ $or: [{ _id: formId }, { code: formId }] })
      : await FormModel.findOne({ code: formId });

    if (!form || !form.isActive) {
      return next(new AppError("Form not available", 404));
    }

    if (isFormClosed(form)) {
      return next(
        new AppError("This form has reached its deadline and is no longer accepting responses.", 403)
      );
    }

    let resolvedUserId = req?.user?._id || (req?.user as any)?.id || null;
    const submittedEmail =
      responses?.email_address ||
      responses?.email ||
      responses?.contact_email ||
      responses?.user_email ||
      null;

    // Fallback: If token not attached, check if submitted email belongs to a registered member
    if (!resolvedUserId && submittedEmail && typeof submittedEmail === "string") {
      const matchedUser = await UserModel.findOne({
        email: { $regex: new RegExp(`^${submittedEmail.trim()}$`, "i") },
      }).select("_id");
      if (matchedUser) {
        resolvedUserId = matchedUser._id;
      }
    }

    // Check for duplicate submissions if restricted
    if (!form.allowMultipleSubmissions) {
      if (resolvedUserId) {
        const existing = await FormSubmissionModel.findOne({ formId: form._id, userId: resolvedUserId });
        if (existing) {
          return next(new AppError("You have already submitted a response for this form.", 400));
        }
      } else if (submittedEmail) {
        // For anonymous submissions, check by email in responses
        const allSubs = await FormSubmissionModel.find({ formId: form._id });
        const emailExists = allSubs.some((sub) => {
          const r = sub.responses as Record<string, any>;
          return (
            r?.email_address === submittedEmail ||
            r?.email === submittedEmail ||
            r?.contact_email === submittedEmail ||
            r?.user_email === submittedEmail
          );
        });
        if (emailExists) {
          return next(new AppError("A response with this email has already been submitted.", 400));
        }
      }
    }

    // Validate required fields
    for (const field of form.fields) {
      if (field.required && responses[field.name] == null) {
        return next(new AppError(`"${field.label}" is required`, 400));
      }
    }

    const submission = await FormSubmissionModel.create({
      formId: form._id,
      userId: resolvedUserId,
      responses,
    });

    // Ensure form is linked to event if form is associated with an event
    if (form.eventId) {
      try {
        const { Event } = await import("../models/Event.model");
        const event = await Event.findById(form.eventId);
        if (event) {
          let needsSave = false;
          if (!event.forms.some((f) => f.toString() === form._id.toString())) {
            event.forms.push(form._id as any);
            needsSave = true;
          }
          if (!event.linkedForm) {
            event.linkedForm = form._id as any;
            needsSave = true;
          }
          if (needsSave) {
            await event.save();
          }
        }
      } catch (evErr) {
        console.warn("Failed to link form to event:", evErr);
      }
    }

    res.status(201).json({
      success: true,
      message: "Form submitted successfully",
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all submissions for a form (Admin)
 */
export const getSubmissionsByForm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.formId);
    const form = isObjectId
      ? await FormModel.findOne({ $or: [{ _id: req.params.formId }, { code: req.params.formId }] })
      : await FormModel.findOne({ code: req.params.formId });

    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    const submissions = await FormSubmissionModel.find({
      formId: form._id,
    }).populate("userId", "fullName email");

    // Dynamic auto-link for past or unlinked submissions if response email matches a user
    for (const sub of submissions) {
      if (!sub.userId && sub.responses) {
        const r = sub.responses as Record<string, any>;
        const subEmail =
          r?.email_address ||
          r?.email ||
          r?.contact_email ||
          r?.user_email;
        if (subEmail && typeof subEmail === "string") {
          const matchedUser = await UserModel.findOne({
            email: { $regex: new RegExp(`^${subEmail.trim()}$`, "i") },
          }).select("fullName email");
          if (matchedUser) {
            (sub as any).userId = matchedUser;
            FormSubmissionModel.findByIdAndUpdate(sub._id, { userId: matchedUser._id }).catch(() => {});
          }
        }
      }
    }

    res.json({
      success: true,
      data: submissions,
    });
  } catch (error) {
    next(error);
  }
};

import * as XLSX from "xlsx";

/**
 * Export form submissions as CSV or XLSX file directly from backend (Admin)
 */
export const exportSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { formId } = req.params;
    const format = (req.query.format as string)?.toLowerCase() === "csv" ? "csv" : "xlsx";

    const isObjectId = mongoose.Types.ObjectId.isValid(formId);
    const form = isObjectId
      ? await FormModel.findOne({ $or: [{ _id: formId }, { code: formId }] })
      : await FormModel.findOne({ code: formId });

    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    const submissions = await FormSubmissionModel.find({ formId: form._id }).populate("userId", "fullName email");

    // Dynamic auto-link for export if unlinked
    for (const sub of submissions) {
      if (!sub.userId && sub.responses) {
        const r = sub.responses as Record<string, any>;
        const subEmail =
          r?.email_address ||
          r?.email ||
          r?.contact_email ||
          r?.user_email;
        if (subEmail && typeof subEmail === "string") {
          const matchedUser = await UserModel.findOne({
            email: { $regex: new RegExp(`^${subEmail.trim()}$`, "i") },
          }).select("fullName email");
          if (matchedUser) {
            (sub as any).userId = matchedUser;
            FormSubmissionModel.findByIdAndUpdate(sub._id, { userId: matchedUser._id }).catch(() => {});
          }
        }
      }
    }

    const fields = form.fields || [];

    const headers = ["#", "Submitted At", ...fields.map((f) => f.label)];
    const rows = submissions.map((sub: any, i) => [
      i + 1,
      new Date(sub.createdAt).toLocaleString("en-GB"),
      ...fields.map((f) => {
        const val = sub.responses?.[f.name];
        if (val == null) return "";
        if (Array.isArray(val)) return val.join(", ");
        if (typeof val === "object") return val.url || JSON.stringify(val);
        return String(val);
      }),
    ]);

    const sanitizedTitle = (form.title || "Form Responses").replace(/[/\\?%*:|"<>]/g, "_").trim();

    if (format === "xlsx") {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 20 },
        ...fields.map((f) => ({ wch: Math.max(18, Math.min(45, f.label.length + 4)) })),
      ];

      const wb = XLSX.utils.book_new();
      const sheetName = (form.title || "Responses").slice(0, 31).replace(/[/\\?*[\]]/g, "_");
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const fileName = `${sanitizedTitle} - Responses.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.send(buffer);
    } else {
      const csvContent = [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\r\n");

      const fileName = `${sanitizedTitle} - Responses.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.send("\uFEFF" + csvContent);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a submission (Admin/Moderator)
 */
export const deleteSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { submissionId } = req.params;
    const submission = await FormSubmissionModel.findById(submissionId);
    if (!submission) {
      return next(new AppError("Submission not found", 404));
    }

    // Delete any media files in responses
    if (submission.responses) {
      for (const val of Object.values(submission.responses)) {
        if (typeof val === "string" && val.includes("cloudinary.com")) {
          try {
            const parts = val.split("/upload/");
            if (parts.length > 1) {
              let pubId = parts[1].replace(/^v\d+\//, "");
              const lastDot = pubId.lastIndexOf(".");
              if (lastDot !== -1) pubId = pubId.substring(0, lastDot);
              await deleteFromCloudinary(pubId);
            }
          } catch (cErr) {
            console.warn("Failed to delete file from Cloudinary:", cErr);
          }
        }
      }
    }

    // If submission belongs to an event form, synchronize and clean up event participants
    try {
      const form = await FormModel.findById(submission.formId);
      if (form && form.eventId) {
        const { Event } = await import("../models/Event.model");
        const event = await Event.findById(form.eventId);
        if (event) {
          const details = extractApplicantDetails(submission.responses || {});
          const subEmail = details.email ? details.email.toLowerCase() : null;
          const subUserId = submission.userId ? submission.userId.toString() : null;

          let updated = false;

          // Remove from approvedParticipants if present
          if (Array.isArray(event.approvedParticipants) && (subEmail || subUserId)) {
            const beforeCount = event.approvedParticipants.length;
            event.approvedParticipants = (event.approvedParticipants as any).filter((p: any) => {
              if (subUserId && p.userId && p.userId.toString() === subUserId) return false;
              if (subEmail && p.email && p.email.toLowerCase() === subEmail) return false;
              return true;
            });
            if (event.approvedParticipants.length !== beforeCount) updated = true;
          }

          // Remove from attendees if present
          if (subUserId && Array.isArray(event.attendees)) {
            const beforeCount = event.attendees.length;
            event.attendees = event.attendees.filter((attId: any) => attId.toString() !== subUserId);
            if (event.attendees.length !== beforeCount) {
              updated = true;
              await UserModel.findByIdAndUpdate(subUserId, {
                $pull: { eventsAttended: event._id },
              }).catch(() => {});
            }
          }

          // Remove from legacy pendingParticipants if present
          if (Array.isArray(event.pendingParticipants)) {
            const beforeCount = event.pendingParticipants.length;
            event.pendingParticipants = (event.pendingParticipants as any).filter((p: any) => {
              if (subUserId && p.userId && p.userId.toString() === subUserId) return false;
              if (subEmail && p.leaderEmail && p.leaderEmail.toLowerCase() === subEmail) return false;
              return true;
            });
            if (event.pendingParticipants.length !== beforeCount) updated = true;
          }

          if (updated) {
            await event.save();
          }
        }
      }
    } catch (cleanErr) {
      console.warn("Failed to synchronize event participants on submission deletion:", cleanErr);
    }

    await FormSubmissionModel.findByIdAndDelete(submissionId);

    res.status(200).json({
      success: true,
      message: "Submission deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update/modify a submission responses (Admin/Moderator)
 */
export const updateSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { submissionId } = req.params;
    const { responses } = req.body;

    const submission = await FormSubmissionModel.findById(submissionId);
    if (!submission) {
      return next(new AppError("Submission not found", 404));
    }

    if (responses) {
      submission.responses = responses;
    }
    await submission.save();

    const updated = await FormSubmissionModel.findById(submissionId).populate("userId", "fullName email");

    res.status(200).json({
      success: true,
      message: "Submission updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

