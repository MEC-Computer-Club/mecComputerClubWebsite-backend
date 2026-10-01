import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { Certificate } from "../models/Certificate.model";
import { CertificateTemplate } from "../models/CertificateTemplate.model";
import User from "../models/User.model";
import { Event } from "../models/Event.model";
import { createNotification } from "../services/notification.service";

/**
 * @desc  Verify a certificate by its unique certificateId
 * @route GET /api/certificates/verify/:certificateId
 * @access Public
 */
export const verifyCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { certificateId } = req.params;

    if (!certificateId || certificateId.trim() === "") {
      return res.status(400).json({ success: false, valid: false, message: "Certificate ID is required." });
    }

    const cleanId = certificateId.trim().toUpperCase();

    const cert = await Certificate.findOne({
      certificateId: { $regex: new RegExp(`^${cleanId}$`, "i") },
    })
      .populate("recipient", "fullName email studentId department batch session imageUrl imagePosition role designation clubRole")
      .populate("associatedEvent", "title slug date location category coverImageUrl")
      .populate("issuedBy", "fullName email role designation")
      .populate("template")
      .lean();

    if (!cert) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "Certificate not found. The ID may be invalid or does not exist in the official MEC Computer Club registry.",
      });
    }

    const isValid = cert.status === "valid";

    // Support both User recipient and non-member recipient snapshot
    const recipientData = cert.recipient || {
      fullName: (cert as any).recipientName || "Participant",
      email: (cert as any).recipientEmail || "",
      studentId: (cert as any).recipientStudentId || "",
      department: (cert as any).recipientDepartment || "",
    };

    res.status(200).json({
      success: true,
      valid: isValid,
      status: cert.status || "valid",
      message: isValid
        ? "Certificate verified authentic and officially registered."
        : `Certificate has been revoked: ${cert.revocationReason || "Revoked by authority"}.`,
      data: {
        _id: cert._id,
        certificateId: cert.certificateId,
        name: cert.name,
        description: cert.description,
        issueDate: cert.issueDate,
        digitalUrl: cert.digitalUrl,
        type: cert.type || "participation",
        position: cert.position,
        status: cert.status || "valid",
        revokedAt: cert.revokedAt,
        revocationReason: cert.revocationReason,
        recipient: recipientData,
        associatedEvent: cert.associatedEvent,
        issuedBy: cert.issuedBy,
        template: (cert as any).template,
        verifiedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get all certificates for a user
 * @route GET /api/certificates/user/:userId
 * @access Public
 */
export const getUserCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;

    const certs = await Certificate.find({ recipient: userId })
      .populate("associatedEvent", "title slug date location category")
      .populate("template")
      .sort({ issueDate: -1 })
      .lean();

    res.status(200).json({ success: true, data: certs });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get all certificates for the currently authenticated user
 * @route GET /api/certificates/my-certificates
 * @access Private
 */
export const getMyCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("studentId email").lean();

    const orClauses: any[] = [{ recipient: userId }];

    if (user?.studentId) {
      orClauses.push({ recipientStudentId: { $regex: new RegExp(`^${user.studentId.trim()}$`, "i") } });
    }
    if (user?.email) {
      orClauses.push({ recipientEmail: user.email.trim().toLowerCase() });
    }

    const certs = await Certificate.find({ $or: orClauses })
      .populate("associatedEvent", "title slug date location category coverImageUrl")
      .populate("template")
      .populate("issuedBy", "fullName email role designation")
      .sort({ issueDate: -1 })
      .lean();

    res.status(200).json({ success: true, data: certs });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Create a certificate (admin/executive)
 * @route POST /api/certificates
 * @access Admin/Executive
 */
export const createCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      recipientId,
      recipientName,
      recipientEmail,
      recipientStudentId,
      recipientDepartment,
      associatedEventId,
      issueDate,
      certificateId,
      digitalUrl,
      type = "participation",
      position,
      templateId,
      template,
    } = req.body;

    const adminId = (req as any).user?.id;

    if (!name || (!recipientId && !recipientName)) {
      return res.status(400).json({ success: false, message: "name and recipient (or recipientName) are required." });
    }

    let finalUserId: any = undefined;
    let finalRecipientName = recipientName;
    let finalRecipientEmail = recipientEmail;
    let finalRecipientStudentId = recipientStudentId;
    let finalRecipientDepartment = recipientDepartment;

    if (recipientId) {
      const user = await User.findById(recipientId);
      if (user) {
        finalUserId = user._id;
        finalRecipientName = finalRecipientName || user.fullName;
        finalRecipientEmail = finalRecipientEmail || user.email;
        finalRecipientStudentId = finalRecipientStudentId || user.studentId;
        finalRecipientDepartment = finalRecipientDepartment || user.department;
      }
    }

    // Resolve template (provided or default)
    let finalTemplateId = templateId || template;
    if (!finalTemplateId) {
      const defTpl = await CertificateTemplate.findOne({ isDefault: true }).select("_id").lean();
      if (defTpl) finalTemplateId = defTpl._id;
    }

    // Generate certificateId if omitted
    const year = new Date(issueDate || Date.now()).getFullYear();
    const finalCertId = certificateId
      ? certificateId.trim().toUpperCase()
      : `MCC-${year}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    // Check unique certificateId
    const existing = await Certificate.findOne({ certificateId: finalCertId });
    if (existing) {
      return res.status(400).json({ success: false, message: `Certificate ID "${finalCertId}" already exists.` });
    }

    const cert = await Certificate.create({
      name,
      description,
      recipient: finalUserId,
      recipientName: finalRecipientName,
      recipientEmail: finalRecipientEmail,
      recipientStudentId: finalRecipientStudentId,
      recipientDepartment: finalRecipientDepartment,
      associatedEvent: associatedEventId || undefined,
      template: finalTemplateId || undefined,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      certificateId: finalCertId,
      digitalUrl: digitalUrl || `/verify?cert=${finalCertId}`,
      type,
      position: position || undefined,
      issuedBy: adminId || undefined,
      status: "valid",
    });

    // Link certificate to user profile if user exists
    if (finalUserId) {
      await User.findByIdAndUpdate(finalUserId, { $addToSet: { certificates: cert._id } });

      // Dispatch in-app notification to certificate recipient
      createNotification({
        recipient: finalUserId,
        type: "certificate",
        title: "Certificate Issued! 🎓",
        message: `You have been officially awarded the "${name}" credential.`,
        link: `/verify?cert=${finalCertId}`,
        actionLabel: "View Certificate",
        priority: "high",
        metadata: { certificateId: cert._id, certId: finalCertId },
      }).catch((err) => console.error("Certificate notification error:", err));
    }

    // If associated with an event, link to event
    if (associatedEventId) {
      await Event.findByIdAndUpdate(associatedEventId, { $addToSet: { certificates: cert._id } });
    }

    const populated = await Certificate.findById(cert._id)
      .populate("recipient", "fullName email studentId department batch")
      .populate("associatedEvent", "title date location")
      .populate("template")
      .lean();

    res.status(201).json({ success: true, message: "Certificate issued successfully.", data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Bulk issue certificates (e.g. for mass event participation of 100+ attendees)
 * @route POST /api/certificates/bulk
 * @access Admin/Executive
 */
export const bulkIssueCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      description,
      associatedEventId,
      issueDate,
      type = "participation",
      templateId,
      template,
      recipients, // array of user IDs or { userId, position?, type? }
    } = req.body;

    const adminId = (req as any).user?.id;

    if (!name || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "name and a non-empty recipients array are required for bulk issuance.",
      });
    }

    let eventDoc: any = null;
    if (associatedEventId) {
      eventDoc = await Event.findById(associatedEventId).lean();
    }

    // Resolve template (provided or default)
    let finalTemplateId = templateId || template;
    if (!finalTemplateId) {
      const defTpl = await CertificateTemplate.findOne({ isDefault: true }).select("_id").lean();
      if (defTpl) finalTemplateId = defTpl._id;
    }

    const year = new Date(issueDate || Date.now()).getFullYear();
    const dateObj = issueDate ? new Date(issueDate) : new Date();

    // Normalize recipient objects (supporting members and non-members)
    const normalizedRecipients: {
      userId?: string;
      fullName?: string;
      email?: string;
      studentId?: string;
      department?: string;
      position?: string;
      type: string;
    }[] = recipients.map((r) => {
      if (typeof r === "string") {
        return { userId: r, type };
      }
      return {
        userId: r.userId || (r._id && mongoose.Types.ObjectId.isValid(r._id) ? r._id : undefined),
        fullName: r.fullName || r.name,
        email: r.email,
        studentId: r.studentId,
        department: r.department,
        position: r.position,
        type: r.type || type,
      };
    }).filter((r) => r.userId || r.fullName);

    const userIds = normalizedRecipients.map((r) => r.userId).filter(Boolean);

    // Preload user profiles so recipient details are permanently and immutably snapshotted
    const userMap = new Map<string, any>();
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select("fullName email studentId department")
        .lean();
      users.forEach((u: any) => userMap.set(u._id.toString(), u));
    }

    // Filter out users who already have a certificate for this exact event to prevent duplicate issuance
    let existingRecipientIds = new Set<string>();
    if (associatedEventId && userIds.length > 0) {
      const existingCerts = await Certificate.find({
        associatedEvent: associatedEventId,
        recipient: { $in: userIds },
      }).select("recipient").lean();
      existingRecipientIds = new Set(existingCerts.map((c) => c.recipient?.toString() || ""));
    }

    const toCreate: any[] = [];
    const skippedCount = normalizedRecipients.filter(
      (r) => r.userId && existingRecipientIds.has(r.userId.toString())
    ).length;

    for (const item of normalizedRecipients) {
      if (item.userId && existingRecipientIds.has(item.userId.toString())) {
        continue;
      }

      const uProfile = item.userId ? userMap.get(item.userId.toString()) : null;
      const snapName = (item.fullName || uProfile?.fullName || "Participant").trim();
      const snapEmail = (item.email || uProfile?.email || "").trim();
      const snapStudentId = (item.studentId || uProfile?.studentId || "").trim();
      const snapDept = (item.department || uProfile?.department || "").trim();

      const certId = `MCC-${year}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      toCreate.push({
        name,
        description: description || (eventDoc ? `Awarded for participation in ${eventDoc.title}` : undefined),
        recipient: item.userId || undefined,
        recipientName: snapName,
        recipientEmail: snapEmail,
        recipientStudentId: snapStudentId,
        recipientDepartment: snapDept,
        associatedEvent: associatedEventId || undefined,
        template: finalTemplateId || undefined,
        issueDate: dateObj,
        certificateId: certId,
        digitalUrl: `/verify?cert=${certId}`,
        type: item.type || "participation",
        position: item.position || undefined,
        issuedBy: adminId || undefined,
        status: "valid",
      });
    }

    if (toCreate.length === 0) {
      return res.status(200).json({
        success: true,
        message: "All selected attendees already have certificates for this event. Zero new certificates needed.",
        count: 0,
        skipped: skippedCount,
      });
    }

    // High performance batch insert
    const inserted = await Certificate.insertMany(toCreate);
    const newCertIds = inserted.map((c) => c._id);
    const insertedUserIds = inserted.map((c) => c.recipient).filter(Boolean);

    // Bulk update User profiles in parallel if member userIds present
    if (insertedUserIds.length > 0) {
      await User.updateMany(
        { _id: { $in: insertedUserIds } },
        { $push: { certificates: { $each: newCertIds } } }
      );
    }

    // If attached to event, bulk update event
    if (associatedEventId) {
      await Event.findByIdAndUpdate(associatedEventId, {
        $push: { certificates: { $each: newCertIds } },
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully issued ${inserted.length} certificate(s).${skippedCount > 0 ? ` (${skippedCount} already had one and were skipped)` : ""}`,
      count: inserted.length,
      skipped: skippedCount,
      data: inserted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Revoke a certificate (admin/executive)
 * @route PATCH /api/certificates/:id/revoke
 * @access Admin/Executive
 */
export const revokeCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason = "Revoked by club administration" } = req.body;

    const cert = await Certificate.findById(id);
    if (!cert) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    cert.status = "revoked";
    cert.revokedAt = new Date();
    cert.revocationReason = reason;
    await cert.save();

    res.status(200).json({
      success: true,
      message: `Certificate ${cert.certificateId} has been revoked.`,
      data: cert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Update certificate details or recipient snapshot (admin/executive)
 * @route PATCH /api/certificates/:id
 * @access Admin/Executive
 */
export const updateCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cert = await Certificate.findById(id);
    if (!cert) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    const {
      recipientName,
      recipientStudentId,
      recipientEmail,
      recipientDepartment,
      name,
      description,
      type,
      position,
      issueDate,
      templateId,
      template,
      status,
    } = req.body;

    if (recipientName !== undefined) cert.recipientName = recipientName.trim();
    if (recipientStudentId !== undefined) cert.recipientStudentId = recipientStudentId.trim();
    if (recipientEmail !== undefined) cert.recipientEmail = recipientEmail.trim();
    if (recipientDepartment !== undefined) cert.recipientDepartment = recipientDepartment.trim();
    if (name !== undefined) cert.name = name.trim();
    if (description !== undefined) cert.description = description.trim();
    if (type !== undefined) cert.type = type;
    if (position !== undefined) cert.position = position?.trim() || undefined;
    if (issueDate !== undefined) cert.issueDate = new Date(issueDate);
    if (templateId !== undefined || template !== undefined) cert.template = templateId || template;
    if (status !== undefined) cert.status = status;

    await cert.save();

    const populated = await Certificate.findById(cert._id)
      .populate("recipient", "fullName email studentId department batch session imageUrl imagePosition")
      .populate("associatedEvent", "title slug date location category")
      .populate("issuedBy", "fullName role")
      .populate("template", "name type theme primaryColor borderStyle isDefault")
      .lean();

    res.status(200).json({
      success: true,
      message: "Certificate updated successfully.",
      data: populated || cert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Delete a certificate permanently (admin)
 * @route DELETE /api/certificates/:id
 * @access Admin
 */
export const deleteCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const cert = await Certificate.findById(id);
    if (!cert) {
      return res.status(404).json({ success: false, message: "Certificate not found." });
    }

    // Unlink from User
    await User.findByIdAndUpdate(cert.recipient, { $pull: { certificates: cert._id } });

    // Unlink from Event if applicable
    if (cert.associatedEvent) {
      await Event.findByIdAndUpdate(cert.associatedEvent, { $pull: { certificates: cert._id } });
    }

    await Certificate.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Certificate deleted successfully." });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  List all certificates (admin) with search & filters
 * @route GET /api/certificates
 * @access Admin/Executive
 */
export const listCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const skip = (page - 1) * limit;

    const { search, status, type, eventId } = req.query;

    const query: any = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (eventId) {
      query.associatedEvent = eventId;
    }

    if (search && typeof search === "string" && search.trim()) {
      const s = search.trim();
      // Find matching users by name or studentId first
      const matchedUsers = await User.find({
        $or: [
          { fullName: { $regex: s, $options: "i" } },
          { studentId: { $regex: s, $options: "i" } },
          { email: { $regex: s, $options: "i" } },
        ],
      }).select("_id").lean();

      const matchedUserIds = matchedUsers.map((u) => u._id);

      query.$or = [
        { certificateId: { $regex: s, $options: "i" } },
        { name: { $regex: s, $options: "i" } },
        { recipient: { $in: matchedUserIds } },
        { recipientName: { $regex: s, $options: "i" } },
        { recipientStudentId: { $regex: s, $options: "i" } },
        { recipientEmail: { $regex: s, $options: "i" } },
      ];
    }

    const [certs, total] = await Promise.all([
      Certificate.find(query)
        .populate("recipient", "fullName email studentId department batch session imageUrl imagePosition")
        .populate("associatedEvent", "title slug date location category")
        .populate("issuedBy", "fullName role")
        .populate("template", "name type theme primaryColor borderStyle isDefault")
        .sort({ issueDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Certificate.countDocuments(query),
    ]);

    // Reconstruct recipient snapshot if recipient user document is null (e.g. deleted account) or non-member
    const formattedCerts = certs.map((c: any) => {
      const recipientObj = c.recipient || {
        fullName: c.recipientName || "Participant",
        studentId: c.recipientStudentId || "",
        email: c.recipientEmail || "",
        department: c.recipientDepartment || "",
      };
      return {
        ...c,
        recipient: recipientObj,
        recipientName: c.recipientName || recipientObj.fullName,
        recipientStudentId: c.recipientStudentId || recipientObj.studentId,
        recipientEmail: c.recipientEmail || recipientObj.email,
        recipientDepartment: c.recipientDepartment || recipientObj.department,
      };
    });

    // Quick aggregation counts for admin dashboard
    const [totalCount, validCount, revokedCount] = await Promise.all([
      Certificate.countDocuments(),
      Certificate.countDocuments({ status: "valid" }),
      Certificate.countDocuments({ status: "revoked" }),
    ]);

    res.status(200).json({
      success: true,
      data: formattedCerts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      metrics: {
        total: totalCount,
        valid: validCount,
        revoked: revokedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get all certificates issued for an event
 * @route GET /api/certificates/event/:eventId
 * @access Public / Admin
 */
export const getEventCertificates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const certs = await Certificate.find({ associatedEvent: eventId })
      .populate("recipient", "fullName email studentId department batch session imageUrl imagePosition")
      .populate("template")
      .sort({ issueDate: -1, createdAt: -1 })
      .lean();

    // Map non-member fields into recipient object if user ref not present
    const mapped = certs.map((c: any) => ({
      ...c,
      recipient: c.recipient || {
        fullName: c.recipientName || "Participant",
        email: c.recipientEmail || "",
        studentId: c.recipientStudentId || "",
        department: c.recipientDepartment || "",
      },
    }));

    res.status(200).json({ success: true, data: mapped });
  } catch (error) {
    next(error);
  }
};

