import { Request, Response, NextFunction } from "express";
import FormModel from "../models/Form.model";
import FormSubmissionModel from "../models/FormSubmission.model";
import AppError from "../utils/AppError";

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

    const form = await FormModel.findById(formId);
    if (!form || !form.isActive) {
      return next(new AppError("Form not available", 404));
    }

    // Check for duplicate submissions if restricted
    if (!form.allowMultipleSubmissions) {
      const userId = req?.user?._id;
      const submittedEmail =
        responses?.email_address ||
        responses?.email ||
        responses?.contact_email ||
        null;

      if (userId) {
        const existing = await FormSubmissionModel.findOne({ formId, userId });
        if (existing) {
          return next(new AppError("You have already submitted a response for this form.", 400));
        }
      } else if (submittedEmail) {
        // For anonymous submissions, check by email in responses
        const allSubs = await FormSubmissionModel.find({ formId });
        const emailExists = allSubs.some((sub) => {
          const r = sub.responses as Record<string, any>;
          return (
            r?.email_address === submittedEmail ||
            r?.email === submittedEmail ||
            r?.contact_email === submittedEmail
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
      formId,
      userId: req?.user?._id,
      responses,
    });

    // If form is associated with an event, register into event.pendingParticipants
    if (form.eventId) {
      try {
        const { Event } = await import("../models/Event.model");
        const event = await Event.findById(form.eventId);
        if (event) {
          const leaderName =
            responses?.full_name ||
            responses?.fullName ||
            responses?.name ||
            responses?.leader_name ||
            responses?.captain_name ||
            responses?.applicant_name ||
            req?.user?.fullName ||
            "Participant";
          const leaderEmail =
            responses?.email_address ||
            responses?.email ||
            responses?.contact_email ||
            req?.user?.email ||
            "";
          const leaderPhone =
            responses?.phone ||
            responses?.phone_number ||
            responses?.contact_phone ||
            responses?.mobile ||
            "";
          const leaderStudentId =
            responses?.student_id ||
            responses?.studentId ||
            responses?.id_number ||
            "";
          const teamName =
            responses?.team_name ||
            responses?.teamName ||
            responses?.squad_name ||
            undefined;
          const inGameId =
            responses?.in_game_id ||
            responses?.inGameId ||
            responses?.uid ||
            undefined;

          // Parse members if any (e.g. member_2_name, player_2, etc.)
          const members: any[] = [];
          for (let i = 2; i <= 10; i++) {
            const mName = responses?.[`member_${i}_name`] || responses?.[`player_${i}_name`];
            if (mName) {
              members.push({
                fullName: mName,
                studentId: responses?.[`member_${i}_id`] || responses?.[`player_${i}_id`] || "",
                inGameId: responses?.[`member_${i}_uid`] || responses?.[`player_${i}_uid`] || "",
                email: responses?.[`member_${i}_email`] || "",
                phone: responses?.[`member_${i}_phone`] || "",
              });
            }
          }

          event.pendingParticipants.push({
            userId: req?.user?._id as any,
            teamName,
            leaderName,
            leaderEmail,
            leaderPhone,
            leaderStudentId,
            inGameId,
            members,
            registeredAt: new Date(),
            formData: responses,
          });

          // Ensure form is linked to event
          if (!event.forms.some((f) => f.toString() === formId)) {
            event.forms.push(form._id as any);
          }
          if (!event.linkedForm) {
            event.linkedForm = form._id as any;
          }

          await event.save();
        }
      } catch (evErr) {
        console.warn("Failed to auto-register into event pending participants:", evErr);
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
    const submissions = await FormSubmissionModel.find({
      formId: req.params.formId,
    }).populate("userId", "fullName email");

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

    const form = await FormModel.findById(formId);
    if (!form) {
      return next(new AppError("Form not found", 404));
    }

    const submissions = await FormSubmissionModel.find({ formId }).populate("userId", "fullName email");
    const fields = form.fields || [];

    const headers = ["#", "Submitted By", "Account Email", "Submitted At", ...fields.map((f) => f.label)];
    const rows = submissions.map((sub: any, i) => [
      i + 1,
      sub.userId?.fullName || "Anonymous",
      sub.userId?.email || "N/A",
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
        { wch: 22 },
        { wch: 26 },
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
      const { deleteFromCloudinary } = await import("../services/upload.service");
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

