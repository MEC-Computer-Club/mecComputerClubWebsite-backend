import InvitationCode from "../models/InvitationCode.model";
import { generateOtpCode } from "../utils/generateInviteCode";
import { Request, Response } from "express";
import { sendEmail } from "../utils/sendEmail";
import UserModel from "../models/User.model";
import { generateEmail } from "../utils/generateEmailTemplate";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.model";

/**
 * Create & Dispatch Invitation Code
 * Supports both "single_use" (one-time, email-bound) and "permanent" (reusable for multiple registrations).
 */
export const createInvitationCode = async (req: Request, res: Response) => {
  try {
    const {
      formId,
      email,
      emails,
      role = "member",
      codeType = "single_use",
      customCode,
      label,
      expiresInDays,
      maxUses = 0,
      requireApproval,
      sendEmailNotification = true,
    } = req.body;

    const isPermanent = codeType === "permanent";

    // 1. Parse emails (supports comma-separated string, array, or newline-separated)
    const rawEmailInput = emails || email || "";
    const emailList: string[] = (
      Array.isArray(rawEmailInput)
        ? rawEmailInput
        : typeof rawEmailInput === "string"
        ? rawEmailInput.split(/[\n,]+/)
        : []
    )
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => Boolean(e) && e.includes("@"));

    // Validation for Single-Use
    if (!isPermanent && emailList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one recipient email for single-use invitation codes.",
      });
    }

    // Determine Expiration: Single-use individual codes strictly expire in 15 days
    let expiresAt: Date;
    if (isPermanent) {
      if (expiresInDays && parseInt(expiresInDays) > 0) {
        expiresAt = new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years for permanent
      }
    } else {
      expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // strictly 15 days for individual code
    }

    // Permanent Code Logic
    if (isPermanent) {
      let code: string;
      if (customCode && typeof customCode === "string" && customCode.trim()) {
        code = customCode.trim().toUpperCase();
        const existing = await InvitationCode.findOne({ code });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `The invitation code "${code}" is already in use. Please choose another.`,
          });
        }
      } else {
        code = generateOtpCode();
        let existing = await InvitationCode.findOne({ code });
        while (existing) {
          code = generateOtpCode();
          existing = await InvitationCode.findOne({ code });
        }
      }

      // Universal permanent code: default requireApproval to true unless explicitly disabled
      const permanentRequireApproval =
        requireApproval !== undefined ? Boolean(requireApproval) : true;
      const currentUser = (req as any).user;
      const createdBy = currentUser?._id;
      const creatorName = currentUser?.fullName || currentUser?.name || "Staff Admin";

      const invite = await InvitationCode.create({
        code,
        codeType: "permanent",
        formId,
        role: role || "member",
        email: emailList[0] || "",
        label: label ? label.trim() : "Permanent Reusable Code",
        expiresAt,
        status: "consumable",
        usageCount: 0,
        maxUses: parseInt(maxUses) || 0,
        requireApproval: permanentRequireApproval,
        createdBy,
        creatorName,
      });

      // Audit Log Entry
      AuditLog.create({
        actor: createdBy,
        actorName: creatorName,
        actorEmail: currentUser?.email,
        actorRole: currentUser?.role || "admin",
        action: "CREATE",
        targetType: "INVITATION",
        targetId: invite._id.toString(),
        targetTitle: `Invitation Code: ${invite.code} (${invite.role})`,
        description: `${creatorName} created permanent invitation code "${invite.code}" for role "${invite.role}".`,
        diff: [
          { field: "Code Type", newValue: "permanent" },
          { field: "Role", newValue: invite.role },
          { field: "Requires Approval", newValue: permanentRequireApproval ? "Yes" : "No (Auto-approved)" },
        ],
      }).catch((logErr) => console.error("Failed to write audit log for invitation:", logErr));

      return res.json({
        success: true,
        message: `Permanent invitation code "${invite.code}" created successfully.`,
        invite,
        invites: [invite],
      });
    }

    // Single-Use Code(s) Logic - Supports Multiple Comma-Separated Emails
    const createdInvites = [];
    const errors: string[] = [];

    for (const cleanEmail of emailList) {
      try {
        // Check if active verified approved user already exists
        const existingUser = await UserModel.findOne({ email: cleanEmail });
        if (existingUser && existingUser.isVerified && existingUser.applicationStatus === "approved") {
          errors.push(`Account already exists and active for ${cleanEmail}`);
          continue;
        }

        if (existingUser) {
          // Clean up incomplete/unverified stub
          await UserModel.deleteOne({ _id: existingUser._id });
        }

        // Delete stale single-use codes for this email
        await InvitationCode.deleteMany({ email: cleanEmail, codeType: "single_use" });

        // Generate unique code (or custom code if exactly 1 email with custom code)
        let code: string;
        if (emailList.length === 1 && customCode && typeof customCode === "string" && customCode.trim()) {
          code = customCode.trim().toUpperCase();
          const existing = await InvitationCode.findOne({ code });
          if (existing) {
            return res.status(400).json({
              success: false,
              message: `The invitation code "${code}" is already in use. Please choose another.`,
            });
          }
        } else {
          code = generateOtpCode();
          let existing = await InvitationCode.findOne({ code });
          while (existing) {
            code = generateOtpCode();
            existing = await InvitationCode.findOne({ code });
          }
        }

        const currentUser = (req as any).user;
        const createdBy = currentUser?._id;
        const creatorName = currentUser?.fullName || currentUser?.name || "Staff Admin";

        const invite = await InvitationCode.create({
          code,
          codeType: "single_use",
          formId,
          role: role || "member",
          email: cleanEmail,
          label: label ? label.trim() : `Individual Member Invite (${cleanEmail})`,
          expiresAt,
          status: "consumable",
          usageCount: 0,
          maxUses: 1,
          requireApproval: false, // Individual invitations bypass admin approval!
          createdBy,
          creatorName,
        });

        createdInvites.push(invite);

        // Audit Log Entry
        AuditLog.create({
          actor: createdBy,
          actorName: creatorName,
          actorEmail: currentUser?.email,
          actorRole: currentUser?.role || "admin",
          action: "CREATE",
          targetType: "INVITATION",
          targetId: invite._id.toString(),
          targetTitle: `Invitation for ${cleanEmail} (${role || "member"})`,
          description: `${creatorName} issued single-use invitation code "${invite.code}" to ${cleanEmail}.`,
          diff: [
            { field: "Code Type", newValue: "single_use" },
            { field: "Recipient Email", newValue: cleanEmail },
            { field: "Role", newValue: role || "member" },
          ],
        }).catch((logErr) => console.error("Failed to write audit log for invitation:", logErr));

        // Send Email if requested
        if (sendEmailNotification) {
          try {
            const assignedRole = invite.role || "member";
            const template = generateEmail("invitation", {
              code: invite.code,
              link: `${process.env.FRONTEND_URL}/register?role=${assignedRole}&code=` + invite.code,
            });
            await sendEmail(cleanEmail, "Your MEC Computer Club Invitation Code", template);
          } catch (mailErr) {
            console.warn(`Failed to dispatch invitation email to ${cleanEmail}:`, mailErr);
          }
        }
      } catch (itemErr: any) {
        console.error(`Error issuing invite for ${cleanEmail}:`, itemErr);
        errors.push(`Failed for ${cleanEmail}: ${itemErr?.message || "Internal error"}`);
      }
    }

    if (createdInvites.length === 0) {
      return res.status(400).json({
        success: false,
        message: errors.length > 0 ? errors.join("; ") : "No invitation codes could be generated.",
      });
    }

    const message =
      createdInvites.length === 1
        ? `Invitation code generated and emailed to ${createdInvites[0].email} successfully.`
        : `Successfully generated and dispatched ${createdInvites.length} invitation codes!${
            errors.length > 0 ? ` (${errors.length} skipped)` : ""
          }`;

    return res.json({
      success: true,
      message,
      invites: createdInvites,
      invite: createdInvites[0],
    });
  } catch (err: any) {
    console.error("Create invitation error:", err);
    if (err.name === "ValidationError" || err.name === "MongooseError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err?.message || "Server error while creating invitation" });
  }
};

/**
 * Get All / Search Invitation Codes (Admin / Moderator)
 * Supports search by email/code/label, filter by status or codeType, and pagination.
 */
export const getAllInvitationCodes = async (req: Request, res: Response) => {
  try {
    const { search, role, status, codeType, page = "1", limit = "100" } = req.query;
    const filter: any = {};

    if (role && role !== "all") {
      filter.role = role;
    }
    if (status && status !== "all") {
      filter.status = status;
    }
    if (codeType && codeType !== "all") {
      filter.codeType = codeType;
    }
    if (search && typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ email: regex }, { code: regex }, { label: regex }];
    }

    const p = Math.max(1, parseInt(page as string) || 1);
    const lim = Math.max(1, parseInt(limit as string) || 100);
    const skip = (p - 1) * lim;

    const total = await InvitationCode.countDocuments(filter);
    const invites = await InvitationCode.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    // Cross-reference UserModel for single-use emails
    const emails = invites
      .map((i) => (i.email ? i.email.toLowerCase() : ""))
      .filter(Boolean);

    const users = emails.length > 0
      ? await UserModel.find({ email: { $in: emails } })
          .select("email fullName isVerified applicationStatus profileStatus role")
          .lean()
      : [];

    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const enrichedInvites = invites.map((inv) => {
      const user = inv.email ? userMap.get(inv.email.toLowerCase()) : null;
      let accountStatus = "not_created";
      if (user) {
        if (user.isVerified && user.applicationStatus === "approved") {
          accountStatus = "active";
        } else if (!user.isVerified) {
          accountStatus = "unverified";
        } else if (user.applicationStatus === "pending") {
          accountStatus = "pending_approval";
        } else if (user.applicationStatus === "rejected") {
          accountStatus = "rejected";
        } else {
          accountStatus = "incomplete";
        }
      }

      // Check real-time expiry
      let displayStatus = inv.status;
      if (inv.status === "consumable" && inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
        displayStatus = "expired";
      }

      return {
        ...inv,
        requireApproval: inv.requireApproval !== undefined ? inv.requireApproval : inv.codeType === "permanent",
        effectiveStatus: displayStatus,
        accountStatus,
        registeredName: user?.fullName || null,
        isFullyCreated: Boolean(user && user.isVerified && user.applicationStatus === "approved"),
      };
    });

    return res.json({
      success: true,
      data: enrichedInvites,
      pagination: {
        total,
        page: p,
        limit: lim,
        totalPages: Math.ceil(total / lim),
      },
    });
  } catch (err: any) {
    console.error("Get invitations error:", err);
    res.status(500).json({ success: false, message: "Server error fetching invitation codes" });
  }
};

/**
 * Update / Toggle Invitation Code Status (Admin / Moderator)
 * Actions: "consumable" (Available), "discontinued" (Discontinue/Pause), "cancelled"
 */
export const updateInvitationStatus = async (req: Request, res: Response) => {
  try {
    const { id, code, status } = req.body;
    const targetStatus = status === "available" ? "consumable" : status;

    if (!["consumable", "discontinued", "cancelled"].includes(targetStatus)) {
      return res.status(400).json({ success: false, message: 'Status must be "consumable" (available) or "discontinued".' });
    }

    let targetInvite = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      targetInvite = await InvitationCode.findById(id);
    }
    if (!targetInvite && (id || code)) {
      const searchCode = (code || id).toString().trim().toUpperCase();
      targetInvite = await InvitationCode.findOne({ code: searchCode });
    }

    if (!targetInvite) {
      return res.status(404).json({ success: false, message: "Invitation code not found." });
    }

    targetInvite.status = targetStatus;

    // If making available again and expired, refresh expiry
    if (targetStatus === "consumable" && targetInvite.expiresAt && targetInvite.expiresAt < new Date()) {
      if (targetInvite.codeType === "permanent") {
        targetInvite.expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
      } else {
        targetInvite.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    }

    await targetInvite.save();

    const actionText = targetStatus === "consumable" ? "marked as Available" : "Discontinued";
    return res.json({
      success: true,
      message: `Invitation code "${targetInvite.code}" ${actionText} successfully.`,
      invite: targetInvite,
    });
  } catch (err: any) {
    console.error("Update invitation status error:", err);
    res.status(500).json({ success: false, message: err?.message || "Server error updating invitation status" });
  }
};

/**
 * Delete / Remove Invitation Code (Admin / Moderator / Executive)
 */
export const deleteInvitationCode = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id || (req.query.id as string) || (req.body?.id as string) || "";
    const rawCode = (req.query.code as string) || (req.body?.code as string) || "";
    const rawEmail = (req.query.email as string) || (req.body?.email as string) || "";

    let targetInvite = null;

    // 1. Try finding by MongoDB ObjectId if valid
    if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
      targetInvite = await InvitationCode.findById(rawId);
    }

    // 2. Try finding by code string (rawId could be the code, e.g. "MEC-26")
    if (!targetInvite && rawId) {
      targetInvite = await InvitationCode.findOne({
        code: rawId.toString().trim().toUpperCase(),
      });
    }

    // 3. Try finding by explicit code param
    if (!targetInvite && rawCode) {
      targetInvite = await InvitationCode.findOne({
        code: rawCode.toString().trim().toUpperCase(),
      });
    }

    // 4. Try finding by email
    if (!targetInvite && rawEmail) {
      targetInvite = await InvitationCode.findOne({
        email: rawEmail.toString().toLowerCase().trim(),
      });
    }

    if (!targetInvite) {
      if (rawEmail) {
        const cleanEmail = rawEmail.toString().toLowerCase().trim();
        const deleteResult = await InvitationCode.deleteMany({ email: cleanEmail });
        if (deleteResult.deletedCount > 0) {
          return res.json({
            success: true,
            message: `Removed ${deleteResult.deletedCount} invitation(s) for "${cleanEmail}".`,
          });
        }
      }
      return res.status(404).json({ success: false, message: "Invitation code not found." });
    }

    const codeName = targetInvite.code;
    await InvitationCode.findByIdAndDelete(targetInvite._id);

    return res.json({
      success: true,
      message: `Invitation code "${codeName}" removed successfully.`,
    });
  } catch (err: any) {
    console.error("Delete invitation error:", err);
    res.status(500).json({ success: false, message: err?.message || "Server error while deleting invitation" });
  }
};

/**
 * Resend Invitation Code Email (Admin / Moderator)
 */
export const resendInvitationCode = async (req: Request, res: Response) => {
  try {
    const { id, code } = req.body;
    let invite = null;
    if (id) {
      invite = await InvitationCode.findById(id);
    } else if (code) {
      invite = await InvitationCode.findOne({ code: code.toString().trim().toUpperCase() });
    }

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invitation code not found." });
    }

    if (!invite.email) {
      return res.status(400).json({ success: false, message: "This permanent code has no direct email attached to resend to." });
    }

    // Refresh expiry if expired or cancelled
    if (invite.expiresAt && (invite.expiresAt < new Date() || invite.status === "expired" || invite.status === "cancelled")) {
      invite.expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      invite.status = "consumable";
      await invite.save();
    }

    const assignedRole = invite.role || "member";
    const template = generateEmail("invitation", {
      code: invite.code,
      link: `${process.env.FRONTEND_URL}/register?role=${assignedRole}&code=` + invite.code,
    });

    await sendEmail(invite.email, "Your MEC Computer Club Invitation Code (Resent)", template);

    return res.json({
      success: true,
      message: `Invitation email resent to ${invite.email}`,
      invite,
    });
  } catch (err: any) {
    console.error("Resend invitation error:", err);
    res.status(500).json({ success: false, message: err?.message || "Server error resending invitation" });
  }
};

export const getCodeInfo = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    const cleanCode = (code || "").toString().trim().toUpperCase();
    const invite = await InvitationCode.findOne({ code: cleanCode });
    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invalid invitation code",
      });
    }
    return res.json({
      success: true,
      data: invite,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Public Verification Endpoint
 * Validates code status, type, expiry, and max uses.
 */
export const verifyInvitationCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const cleanCode = (code || "").trim();
    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        message: "Invitation code is required",
      });
    }

    const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const invite = await InvitationCode.findOne({
      code: { $regex: new RegExp(`^${escapedCode}$`, "i") },
    });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invalid invitation code",
      });
    }

    // 1. Check Discontinued / Cancelled
    if (invite.status === "discontinued" || invite.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This invitation code has been discontinued by administrators.",
      });
    }

    // 2. Check Consumed (for single_use)
    if (invite.status === "consumed") {
      return res.status(400).json({
        success: false,
        message: "This single-use invitation code has already been consumed.",
      });
    }

    // 3. Check Expired
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      invite.status = "expired";
      await invite.save();

      return res.status(410).json({
        success: false,
        message: "This invitation code has expired.",
      });
    }

    // 4. Check Max Uses Limit
    if (invite.maxUses && invite.maxUses > 0 && invite.usageCount >= invite.maxUses) {
      return res.status(400).json({
        success: false,
        message: "This invitation code has reached its maximum usage limit.",
      });
    }

    // Set clearance cookies
    res.cookie("invitation_validated", "358", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 60 * 1000, // 30 minutes
      path: "/",
    });
    res.cookie("invitation_code", invite.code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 60 * 1000, // 30 minutes
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Invitation code verified",
      data: {
        code: invite.code,
        codeType: invite.codeType,
        formId: invite.formId,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        label: invite.label,
        usageCount: invite.usageCount,
        requireApproval:
          invite.codeType === "permanent"
            ? invite.requireApproval !== undefined
              ? invite.requireApproval
              : true
            : false,
      },
    });
  } catch (err) {
    console.error("Verify code error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error verifying invitation code",
    });
  }
};

export const consumeInvitationCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const cleanCode = (code || "").toString().trim().toUpperCase();
    const invite = await InvitationCode.findOne({ code: cleanCode });

    if (!invite) return res.status(404).json({ success: false, message: "Invalid code" });

    // Permanent codes don't become consumed, they just increment usage
    if (invite.codeType === "permanent") {
      invite.usageCount = (invite.usageCount || 0) + 1;
      await invite.save();
      return res.json({ success: true, message: "Permanent code usage recorded successfully" });
    }

    if (invite.status === "consumed") {
      return res.status(400).json({ success: false, message: "This single-use code is already consumed." });
    }

    invite.status = "consumed";
    invite.usageCount = (invite.usageCount || 0) + 1;
    await invite.save();

    return res.json({ success: true, message: "Code consumed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const cancelInvitationCode = async (req: Request, res: Response) => {
  try {
    const { code, id } = req.body;
    let invite = null;
    if (id) {
      invite = await InvitationCode.findById(id);
    } else if (code) {
      invite = await InvitationCode.findOne({ code: code.toString().trim().toUpperCase() });
    }

    if (!invite) return res.status(404).json({ message: "Code not found" });

    invite.status = "discontinued";
    await invite.save();

    res.json({ success: true, message: `Code ${invite.code} discontinued` });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
