import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as userService from "../services/user.service";
import User, { IUser } from "../models/User.model";
import InvitationCodeModel from "../models/InvitationCode.model";
import { Certificate } from "../models/Certificate.model";
import { Event } from "../models/Event.model";
import { Project } from "../models/Project.model";
import { Blog } from "../models/Blog.model";
import { generateJWT } from "../utils/generateTokens";
import { uploadToCloudinary, deleteFromCloudinary, moveToTrashInCloudinary } from "../services/upload.service";
import { createBroadcastNotification } from "../services/notification.service";
import { sendEmail } from "../utils/sendEmail";
import { generateEmail } from "../utils/generateEmailTemplate";
import { getClientIp } from "../middlewares/loginRateLimiter.middleware";
import AppError from "../utils/AppError";
import { CP_SHEET_PROBLEM_IDS, CP_SHEET_TITLE_INDEX, normalizeProblemTitle } from "../utils/cpSheetProblemIds";

export const register = async (req: Request, res: Response) => {
  let profileImageUrl: string | null = null;
  try {
    // 1. Ensure form data exists
    if (!req.body.data) {
      return res.status(400).json({ success: false, message: "Missing registration data" });
    }

    // 2. Parse JSON payload from FormData
    let payload;
    try {
      payload = JSON.parse(req.body.data);
      payload.socialLinks = {
        facebook: payload.facebook || payload.socialLinks?.facebook || "",
        github: payload.github || payload.socialLinks?.github || "",
        linkedin: payload.linkedin || payload.socialLinks?.linkedin || "",
        codeforces: payload.codeforces || payload.socialLinks?.codeforces || "",
        codechef: payload.codechef || payload.socialLinks?.codechef || "",
        discord: payload.discord || payload.socialLinks?.discord || "",
      };
      delete payload.facebook;
      delete payload.github;
      delete payload.linkedin;
      delete payload.codeforces;
      delete payload.codechef;
      delete payload.discord;

      // Handle role-specific defaults
      const clubRole = payload.clubRole || "member";
      payload.clubRole = clubRole;

      if (!payload.studentId) {
        if (clubRole === "advisor") {
          payload.studentId = payload.facultyId || `FAC-${payload.department || "CSE"}-${Date.now().toString().slice(-4)}`;
        } else if (clubRole === "alumni") {
          payload.studentId = payload.formerStudentId || `ALM-${Date.now().toString().slice(-6)}`;
        } else {
          payload.studentId = `STD-${Date.now().toString().slice(-6)}`;
        }
      }

      if (!payload.session) {
        payload.session = payload.batch || (clubRole === "advisor" ? "Faculty" : "2021-22");
      }
      if (!payload.batch) {
        payload.batch = payload.session || (clubRole === "advisor" ? "Faculty" : `${payload.department || "CSE"}`);
      }
      if (clubRole === "alumni" || payload.isGraduated) {
        payload.isGraduated = true;
      }
    } catch (err) {
      return res.status(400).json({ success: false, message: "Invalid JSON format" });
    }

    // 3. Strict Invitation Code Validation (MUST be verified before any database or Cloudinary operations)
    const rawInviteCode = (
      payload.inviteCode ||
      req.headers["x-invite-code"] ||
      req.cookies?.invitation_code ||
      ""
    ).toString().trim().toUpperCase();

    if (!rawInviteCode) {
      return res.status(403).json({
        success: false,
        message: "An invitation clearance code is strictly required to register. Please obtain a clearance key.",
      });
    }

    const inviteDoc = await InvitationCodeModel.findOne({ code: rawInviteCode });
    if (!inviteDoc) {
      return res.status(403).json({
        success: false,
        message: "Invalid invitation code. Access denied.",
      });
    }

    if (inviteDoc.status === "discontinued" || inviteDoc.status === "cancelled") {
      return res.status(403).json({
        success: false,
        message: "This invitation code has been discontinued or cancelled by administrators.",
      });
    }

    if (inviteDoc.status === "consumed") {
      return res.status(403).json({
        success: false,
        message: "This single-use invitation code has already been consumed and cannot be reused.",
      });
    }

    if (inviteDoc.expiresAt && inviteDoc.expiresAt < new Date()) {
      inviteDoc.status = "expired";
      await inviteDoc.save();
      return res.status(410).json({
        success: false,
        message: "This invitation code has expired.",
      });
    }

    if (inviteDoc.maxUses && inviteDoc.maxUses > 0 && inviteDoc.usageCount >= inviteDoc.maxUses) {
      return res.status(403).json({
        success: false,
        message: "This invitation code has reached its maximum usage limit.",
      });
    }

    // For single-use codes bound to a specific email, verify exact email match
    if (inviteDoc.codeType === "single_use" && inviteDoc.email) {
      if (inviteDoc.email.toLowerCase().trim() !== payload.email.toLowerCase().trim()) {
        return res.status(403).json({
          success: false,
          message: `This invitation code is assigned to ${inviteDoc.email}. You cannot use it with another email address.`,
        });
      }
    }

    // 3b. Strictly Enforce Role and Privileges from Verified Invitation Code
    const inviteRole = (inviteDoc.role || payload.role || "member").toLowerCase().trim();
    if (inviteRole === "admin") {
      payload.role = "admin";
      payload.clubRole = "member";
      payload.applicationStatus = "approved";
      if (!payload.designation) {
        payload.designation = "General Member";
      }
    } else if (inviteRole === "moderator") {
      payload.role = "moderator";
      payload.clubRole = "member";
      payload.applicationStatus = "approved";
      if (!payload.designation) {
        payload.designation = "General Member";
      }
    } else if (inviteRole === "executive") {
      payload.role = "executive";
      payload.clubRole = "executive";
      payload.applicationStatus = "approved";
      if (!payload.designation || payload.designation === "General Member") {
        payload.designation = "Executive Member";
      }
    } else if (inviteRole === "alumni") {
      payload.role = "alumni";
      payload.clubRole = "alumni";
      payload.isGraduated = true;
      if (!payload.designation || payload.designation === "General Member") {
        payload.designation = "Alumni";
      }
    } else if (inviteRole === "advisor") {
      payload.role = "member";
      payload.clubRole = "advisor";
      if (!payload.designation || payload.designation === "General Member") {
        payload.designation = "Faculty Advisor";
      }
      payload.session = payload.session || "Faculty";
      payload.batch = payload.batch || "Faculty";
      if (!payload.studentId || payload.studentId.startsWith("STD-")) {
        payload.studentId = payload.facultyId || `FAC-${payload.department || "CSE"}-${Date.now().toString().slice(-4)}`;
      }
    } else {
      payload.role = payload.role && payload.role !== "guest" ? payload.role : "member";
      payload.clubRole = payload.clubRole || "member";
    }

    // Determine if candidate requires admin approval:
    // Single-use individual codes ALWAYS bypass admin approval (auto-approved upon email confirmation).
    // Permanent universal codes check inviteDoc.requireApproval (defaults to true).
    const requiresAdminApproval =
      inviteDoc.codeType === "permanent"
        ? inviteDoc.requireApproval !== undefined
          ? Boolean(inviteDoc.requireApproval)
          : true
        : false;

    if (!requiresAdminApproval) {
      payload.applicationStatus = "approved";
      payload.approvedAt = new Date();
      payload.profileStatus = "active";
    }

    // 4. Pre-upload Unique Account Check
    const exists = await User.findOne({
      $or: [{ email: payload.email.toLowerCase().trim() }, { studentId: payload.studentId }],
    });

    if (exists) {
      return res
        .status(400)
        .json({ success: false, message: "Email or student ID already registered" });
    }

    // 5. Check image presence
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Profile image is required" });
    }

    // 6. Upload image to Cloudinary
    try {
      const uploadResult = await uploadToCloudinary(req.file);
      profileImageUrl = uploadResult.url;
    } catch (err) {
      console.error("Image upload failed:", err);
      return res.status(500).json({ success: false, message: "Image upload failed" });
    }

    // 7. Attach image to payload
    payload.imageUrl = profileImageUrl;

    // 8. Create user & atomically consume invitation clearance
    const user = await userService.createUser(payload, inviteDoc);

    // 9. Clear clearance cookies
    res.clearCookie("invitation_code", { path: "/" });
    res.clearCookie("invitation_validated", { path: "/" });

    // Notify executive board about new registration application ONLY if application is not auto-approved
    if (user.applicationStatus !== "approved") {
      createBroadcastNotification({
        recipientRole: "executive",
        type: "approval",
        title: "New Member Application",
        message: `${user.fullName || "A new student"} submitted an application for club membership.`,
        link: "/dashboard/members",
        actionLabel: "Review Application",
        priority: "high",
        metadata: { applicantId: user._id },
      }).catch((err) => console.error("Notification creation error:", err));
    }

    // 10. Success Response
    return res.status(201).json({
      success: true,
      message: "Registered. Check your email for verification link & code",
      user: {
        id: user._id,
        email: user.email,
        profileImage: profileImageUrl,
      },
    });
  } catch (err: any) {
    console.error("Register error:", err);

    // Clean up uploaded Cloudinary image if user creation failed
    if (profileImageUrl) {
      try {
        await deleteFromCloudinary(profileImageUrl);
      } catch (delErr) {
        console.warn("Failed to cleanup Cloudinary image after registration error:", delErr);
      }
    }

    // Check if it's a Mongoose validation error
    if (err.name === "ValidationError") {
      const errors: any = {};
      Object.keys(err.errors).forEach((key) => {
        errors[key] = err.errors[key].message;
      });

      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }

    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, studentId, identifier, loginId, password, securityCode } = req.body;
    const searchIdentifier = (identifier || loginId || email || studentId || "").trim();

    if (!searchIdentifier || !password) {
      return res.status(400).json({ success: false, message: "Please provide your Student ID or Email, and Password." });
    }

    const clientUserAgent = (req.headers["user-agent"] as string) || "unknown-agent";
    const clientIp = getClientIp(req);

    const user = await User.findOne({
      $or: [
        { email: searchIdentifier.toLowerCase() },
        { studentId: searchIdentifier },
      ],
    }).select("+password");

    // Prevent timing side-channel attack and account enumeration
    if (!user) {
      await bcrypt.compare(password, "$2a$10$e8ix775Fpzn9gK.5hXp4aO0V4hS3Ytq4YkF96/N6h.bLzFq5tW4eq");
      return res.status(401).json({ success: false, message: "Invalid student ID/email or password." });
    }

    // Ensure security subdocument is initialized
    if (!user.security) {
      user.security = {
        failedAttempts: 0,
        activeSession: { isOnline: false },
      };
    }

    const now = new Date();

    // 1. If lockout duration has elapsed, automatically lift the lockout and reset failed attempts
    if (user.security.lockUntil && user.security.lockUntil <= now) {
      user.security.lockUntil = null;
      user.security.failedAttempts = 0;
      user.security.lastFailedAttemptAt = null;
      user.security.loginCode = null;
      user.security.loginCodeExpiry = null;
      user.security.codeSentAt = null;
      await user.save();
    }

    // 2. Sliding window: If the last failed attempt occurred more than 30 minutes ago,
    // reset failedAttempts counter so stale attempts from hours or days ago do not accumulate.
    if (
      !user.security.lockUntil &&
      user.security.lastFailedAttemptAt &&
      now.getTime() - new Date(user.security.lastFailedAttemptAt).getTime() > 30 * 60 * 1000
    ) {
      user.security.failedAttempts = 0;
      user.security.lastFailedAttemptAt = null;
    }

    const isLocked = Boolean(user.security.lockUntil && user.security.lockUntil > now);
    const remainingLockMinutes = isLocked && user.security.lockUntil ? Math.max(1, Math.ceil((user.security.lockUntil.getTime() - now.getTime()) / 60000)) : 0;

    // Check if security code is provided
    const providedSecurityCode = securityCode ? String(securityCode).trim() : null;
    const hasValidSecurityCode =
      Boolean(providedSecurityCode) &&
      Boolean(user.security.loginCode) &&
      user.security.loginCode === providedSecurityCode &&
      Boolean(user.security.loginCodeExpiry && user.security.loginCodeExpiry > now);

    // If account is locked
    if (isLocked) {
      if (providedSecurityCode && !hasValidSecurityCode) {
        return res.status(423).json({
          success: false,
          message: `The security code provided is invalid or has expired. Please check your email or wait ${remainingLockMinutes} minute(s).`,
          isLocked: true,
          requiresSecurityCode: true,
          lockRemainingMinutes: remainingLockMinutes,
        });
      }
      if (!hasValidSecurityCode) {
        // Only generate and send email if no code is currently saved in DB or if existing code has expired
        const canSendCode =
          !user.security.loginCode ||
          !user.security.loginCodeExpiry ||
          user.security.loginCodeExpiry < now;

        if (canSendCode) {
          const secCode = user.generateLoginSecurityCode();
          await user.save();
          const frontendUrl = process.env.FRONTEND_URL || "https://mec-cc.vercel.app";
          const emailHtml = generateEmail("loginSecurityCode", {
            userName: user.fullName,
            code: secCode,
            clubName: "MEC Computer Club",
            link: `${frontendUrl}/forgot-password`,
          });
          try {
            await sendEmail(user.email, "Security Alert: Login Security Code - MEC CC", emailHtml);
            console.log(`[Auth] Login security code sent to ${user.email}`);
          } catch (err) {
            console.error("Failed to send login security code email:", err);
          }
        }

        return res.status(423).json({
          success: false,
          message: "Your account is locked due to several failed attempts. Please check your email and enter the security code to unlock.",
          isLocked: true,
          requiresSecurityCode: true,
          lockRemainingMinutes: remainingLockMinutes,
        });
      }
    }

    const matched = await user.comparePassword(password);

    // Password verification failed
    if (!matched) {
      if (isLocked && hasValidSecurityCode) {
        return res.status(401).json({
          success: false,
          message: "Security code verified, but the password entered is incorrect. Please check your password.",
          isLocked: true,
          requiresSecurityCode: true,
          lockRemainingMinutes: remainingLockMinutes,
        });
      }

      // Update last failed attempt timestamp
      user.security.lastFailedAttemptAt = now;

      // Increment account failed attempts
      user.security.failedAttempts = (user.security.failedAttempts || 0) + 1;

      // Lock account ONLY when failed attempts reach 5 or more
      if (user.security.failedAttempts >= 5) {
        user.security.lockUntil = new Date(now.getTime() + 30 * 60 * 1000);
        const secCode = user.generateLoginSecurityCode();
        await user.save();

        const frontendUrl = process.env.FRONTEND_URL || "https://mec-cc.vercel.app";
        const emailHtml = generateEmail("loginSecurityCode", {
          userName: user.fullName,
          code: secCode,
          clubName: "MEC Computer Club",
          link: `${frontendUrl}/forgot-password`,
        });
        try {
          await sendEmail(user.email, "Security Alert: Login Security Code - MEC CC", emailHtml);
          console.log(`[Auth] Account locked (5 failed attempts). Login security code sent to ${user.email}`);
        } catch (err) {
          console.error("Failed to send login security code email:", err);
        }

        return res.status(423).json({
          success: false,
          message: "Your account is locked due to several failed attempts. Please check your email and enter the security code to unlock.",
          isLocked: true,
          requiresSecurityCode: true,
          lockRemainingMinutes: 30,
        });
      }

      await user.save();

      const remainingAttempts = Math.max(0, 5 - user.security.failedAttempts);
      return res.status(401).json({
        success: false,
        message: `Invalid student ID/email or password. ${remainingAttempts} attempt(s) remaining before temporary lockout.`,
        attemptsRemaining: remainingAttempts,
        isLocked: false,
        requiresSecurityCode: false,
      });
    }

    // Credentials matched! Reset failed attempts and lockout state
    user.security.failedAttempts = 0;
    user.security.lastFailedAttemptAt = null;
    user.security.lockUntil = null;
    user.security.loginCode = null;
    user.security.loginCodeExpiry = null;
    user.security.codeSentAt = null;

    user.security.activeSession = {
      ip: clientIp,
      userAgent: clientUserAgent.slice(0, 200),
      lastActiveAt: now,
      isOnline: true,
    };

    if (!user.isVerified)
      return res.status(401).json({
        success: false,
        message: "Email not verified",
        user: {
          id: user._id,
          email: user.email,
          studentId: user.studentId,
          isVerified: user.isVerified,
          applicationStatus: user.applicationStatus,
        },
      });

    if (user.applicationStatus === "rejected")
      return res.status(401).json({
        success: false,
        message: "Application rejected.",
        user: {
          id: user._id,
          email: user.email,
          studentId: user.studentId,
          isVerified: user.isVerified,
          applicationStatus: user.applicationStatus,
          rejectionReason: user.rejectionReason,
        },
      });
    if (user.applicationStatus !== "approved")
      return res.status(401).json({
        success: false,
        message: "Application not approved yet.",
        user: {
          id: user._id,
          email: user.email,
          studentId: user.studentId,
          isVerified: user.isVerified,
          applicationStatus: user.applicationStatus,
        },
      });

    user.lastLogin = new Date();
    await user.save();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

    const token = generateJWT({ id: user._id, email: user.email, role: user.role });
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("auth_token", token, {
      httpOnly: true,
      maxAge: sevenDaysInMs,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });
    res.cookie("role", user.role, {
      httpOnly: true,
      maxAge: sevenDaysInMs,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        studentId: user.studentId,
        role: user.role,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyEmailToken = async (req: Request, res: Response) => {
  try {
    const { email, token } = req.body;
    const user = await userService.verifyUserByToken(email, token);
    const isApproved = user.applicationStatus === "approved";
    res.json({
      success: true,
      message: isApproved
        ? "Email verified successfully! Your account is activated and ready to sign in."
        : "Email verified. Admin will review your application.",
      isApproved,
      applicationStatus: user.applicationStatus,
      user: { id: user._id, email: user.email, applicationStatus: user.applicationStatus },
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const verifyEmailCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    const user = await userService.verifyUserByCode(email, code);
    const isApproved = user.applicationStatus === "approved";
    res.json({
      success: true,
      message: isApproved
        ? "Email verified successfully! Your account is activated and ready to sign in."
        : "Email verified. Admin will review your application.",
      isApproved,
      applicationStatus: user.applicationStatus,
      user: { id: user._id, email: user.email, applicationStatus: user.applicationStatus },
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const requestFastVerification = async (req: Request, res: Response) => {
  try {
    // auth middleware sets req.user
    const userId = (req as any).user.id;
    const user = await userService.requestFastVerification(userId);
    res.json({
      message: "Fast verification requested. Admin will be notified",
      user: { id: user._id },
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    await userService.createPasswordReset(req.body.email);
    res.json({ message: "Password reset email sent if account exists" });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, token, newPassword } = req.body;
    await userService.resetPassword(email, token, newPassword);
    res.status(200).json({ success: true, message: "Password updated" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id, oldPassword, newPassword } = req.body;
    const targetUserId = (req as any).user?.id || id;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }
    if ((req as any).user && (req as any).user.role !== "admin" && (req as any).user.id !== targetUserId) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only change your own password." });
    }
    await userService.changePassword(targetUserId, oldPassword, newPassword);
    res.status(200).json({ success: true, message: "Password updated successfully." });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const identifier = req.params.identifier;

    if (!identifier || identifier.trim() === "") {
      return res.status(400).json({ success: false, message: "Bad request. Identifier is required." });
    }

    // Check if caller has an authorization token or cookie with admin/staff privileges or is self
    let requestingUser: any = null;
    const token = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        requestingUser = jwt.verify(token, process.env.JWT_SECRET || "default_secret");
      } catch {}
    }

    const isElevated =
      requestingUser &&
      ["admin", "moderator", "executive", "advisor"].includes(requestingUser.role);

    let user;
    if (isElevated) {
      user = await userService.getUserProfile(identifier);
    } else {
      user = await userService.getPublicUserProfile(identifier);
      if (requestingUser && user && String((user as any)._id) === String(requestingUser.id)) {
        user = await userService.getUserProfile(identifier);
      }
    }

    res.status(200).json({ success: true, message: "User found", data: user });
  } catch (err: any) {
    const msg: string = err?.message || "An error occurred.";

    if (msg.toLowerCase().includes("not found")) {
      return res.status(404).json({ success: false, message: "No member found with that ID, email, or student ID." });
    }
    if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("not authenticated")) {
      return res.status(401).json({ success: false, message: "Unauthorized access. Please log in again." });
    }
    if (msg.toLowerCase().includes("forbidden") || msg.toLowerCase().includes("not allowed")) {
      return res.status(403).json({ success: false, message: "You do not have permission to view this profile." });
    }
    if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("bad request")) {
      return res.status(400).json({ success: false, message: "Bad request. Please check your input." });
    }
    return res.status(500).json({ success: false, message: "Internal server error. Please try again later." });
  }
};

export const getAdminMemberDetails = async (req: Request, res: Response) => {
  try {
    const identifier = req.params.identifier;
    if (!identifier || identifier.trim() === "") {
      return res.status(400).json({ success: false, message: "Bad request. Identifier is required." });
    }

    const user = await userService.getUserProfile(identifier);
    res.status(200).json({ success: true, message: "Member details retrieved", data: user });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err?.message || "Member not found." });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await userService.getUserProfile(userId);
    if (userId) {
      User.findByIdAndUpdate(userId, {
        $set: { "security.activeSession.lastActiveAt": new Date(), "security.activeSession.isOnline": true },
      }).catch(() => {});
    }
    res.status(200).json({ success: true, message: "User found", user });
  } catch (err: any) {
    res.clearCookie("auth_token");
    res.clearCookie("role");
    res.status(400).json({ success: false, message: err.message });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $set: { "security.activeSession.isOnline": false, "security.activeSession.lastActiveAt": new Date() },
      }).catch(() => {});
    }
    res.clearCookie("auth_token", { httpOnly: true, secure: true, sameSite: "lax" });
    res.clearCookie("role", { httpOnly: true, secure: true, sameSite: "lax" });
    res.status(200).json({ success: true, message: "Logged out" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * @desc    Update the currently authenticated user's own profile
 * @route   PATCH /api/users/me
 * @access  Private (any authenticated user)
 */
export const updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;

    // Only allow safe fields to be updated
    const allowedFields = [
      "fullName",
      "contactNumber",
      "department",
      "batch",
      "session",
      "address",
      "bio",
      "skills",
      "website",
      "experiences",
      "education",
      "socialLinks",
      "coverUrl",
      "imageUrl",
      "imagePosition",
      "coverPosition",
    ];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "skills" && Array.isArray(req.body[field])) {
          updates[field] = Array.from(
            new Set(
              req.body[field]
                .map((s: any) => (typeof s === "string" ? s.trim() : ""))
                .filter((s: string) => s.length > 0)
            )
          );
        } else if (field === "website" && typeof req.body[field] === "string") {
          let url = req.body[field].trim();
          if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
          }
          updates[field] = url;
        } else if (field === "experiences" && Array.isArray(req.body[field])) {
          updates[field] = req.body[field].filter(
            (exp: any) => exp && exp.companyName && exp.jobTitle
          );
        } else if (field === "education" && Array.isArray(req.body[field])) {
          updates[field] = req.body[field].filter(
            (edu: any) => edu && edu.institution && edu.degree
          );
        } else {
          updates[field] = req.body[field];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(200).json({ success: true, message: "No changes provided.", user: null });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password -verificationToken -passwordResetToken");

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// -----------------------------------------------------
// 🚀 PATCH METHODS: API ENDPOINTS FOR UPDATES
// -----------------------------------------------------

/**
 * @desc    Update a user's profile details (partial or full update)
 * @route   PATCH /api/v1/users/:id
 * @access  Private (Admin or Owner)
 */
export const updateUserDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIdToUpdate: string = req.params.id;
    const updates = req.body;
    const user = await User.findById(userIdToUpdate);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const requester = (req as any).user;
    if (user._id.toString() !== requester.id && requester.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to perform this action" });
    }
    const protectedFields: Array<"password" | "role" | "email" | "createdAt" | "updatedAt"> = [
      "password",
      "role",
      "email",
      "createdAt",
      "updatedAt",
    ];

    const updateKeys = Object.keys(updates);

    const containsProtectedFields = updateKeys.some((field) =>
      protectedFields.includes(field as "password" | "role" | "email" | "createdAt" | "updatedAt")
    );

    if (containsProtectedFields) {
      return next(
        new AppError(
          "You cannot update protected fields like password, role, or email via this endpoint.",
          403
        )
      );
    }

    // Use a Record utility type for flexible key-value pairs
    const validUpdates: Record<string, any> = {};

    for (const key of updateKeys) {
      const value = updates[key];
      if (value !== undefined && value !== null) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No valid fields provided for update. Skipping update.",
        data: null,
      });
    }

    // --- 3. Mongoose Update Operation ---

    const updatedUser = await User.findByIdAndUpdate(
      userIdToUpdate,
      { $set: validUpdates },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    // --- 4. Error Handling ---

    if (!updatedUser) {
      return next(new AppError("No user found with that ID.", 404));
    }

    // --- 5. Success Response ---

    res.status(200).json({
      status: "success",
      message: "User details updated successfully.",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error); // Pass error to global error handler
  }
};

export const updateUserImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIdToUpdate: string = req.params.id || (req as any).user?.id;
    let user: IUser | null = null;
    try {
      user = await User.findById(userIdToUpdate);
    } catch (error) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const requester = (req as any).user;
    if (user._id.toString() !== requester?.id && requester?.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to perform this action" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    let newImageUrl: string | null = null;
    let newImagePublicId: string | null = null;

    try {
      const uploadResult = await uploadToCloudinary(req.file);
      newImageUrl = uploadResult.url || uploadResult.secure_url || (req.file as any).path;
      newImagePublicId = uploadResult.public_id || (req.file as any).filename;
    } catch (err) {
      console.error("Image upload failed:", err);
      return res.status(500).json({ success: false, message: "Image upload failed" });
    }

    // Move old photo to trash_to_delete folder in Cloudinary
    if (user.imagePublicId) {
      try {
        await moveToTrashInCloudinary(user.imagePublicId);
      } catch (err) {
        console.warn("Could not move old image to trash_to_delete in Cloudinary:", err);
      }
    } else if (user.imageUrl) {
      try {
        const match = user.imageUrl.match(/uploads\/[^.]+/);
        if (match) {
          await moveToTrashInCloudinary(match[0]);
        }
      } catch (err) {
        console.warn("Could not move old image to trash_to_delete in Cloudinary by URL:", err);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userIdToUpdate,
      {
        $set: {
          imageUrl: newImageUrl,
          ...(newImagePublicId ? { imagePublicId: newImagePublicId } : {}),
          ...(req.body.imagePosition ? { imagePosition: req.body.imagePosition } : {}),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("-password -verificationToken -passwordResetToken")
      .lean();

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Profile photo updated successfully.",
      user: updatedUser,
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserCover = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIdToUpdate: string = req.params.id || (req as any).user?.id;
    let user: IUser | null = null;
    try {
      user = await User.findById(userIdToUpdate);
    } catch (error) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const requester = (req as any).user;
    if (user._id.toString() !== requester?.id && requester?.role !== "admin") {
      return res.status(403).json({ success: false, message: "You are not authorized to perform this action" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No cover image file provided" });
    }

    let newCoverUrl: string | null = null;
    let newCoverPublicId: string | null = null;

    try {
      const uploadResult = await uploadToCloudinary(req.file);
      newCoverUrl = uploadResult.url || uploadResult.secure_url || (req.file as any).path;
      newCoverPublicId = uploadResult.public_id || (req.file as any).filename;
    } catch (err) {
      console.error("Cover upload failed:", err);
      return res.status(500).json({ success: false, message: "Cover upload failed" });
    }

    // Move old cover to trash_to_delete folder in Cloudinary
    if (user.coverPublicId) {
      try {
        await moveToTrashInCloudinary(user.coverPublicId);
      } catch (err) {
        console.warn("Could not move old cover to trash_to_delete in Cloudinary:", err);
      }
    } else if (user.coverUrl) {
      try {
        const match = user.coverUrl.match(/uploads\/[^.]+/);
        if (match) {
          await moveToTrashInCloudinary(match[0]);
        }
      } catch (err) {
        console.warn("Could not move old cover to trash_to_delete in Cloudinary by URL:", err);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userIdToUpdate,
      {
        $set: {
          coverUrl: newCoverUrl,
          ...(newCoverPublicId ? { coverPublicId: newCoverPublicId } : {}),
          ...(req.body.coverPosition ? { coverPosition: req.body.coverPosition } : {}),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("-password -verificationToken -passwordResetToken")
      .lean();

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Cover photo updated successfully.",
      user: updatedUser,
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
  const {
    fullName,
    email,
    studentId,
    contactNumber,
    address,
    bio,
    department,
    session,
    batch,
    isGraduated,
    passingYear,
    role,
    clubRole,
    customRole,
    designation,
    applicationStatus,
    profileStatus,
    skills,
    website,
    socialLinks,
    imageUrl,
    imagePosition,
    coverUrl,
    coverPosition,
    experiences,
    education,
  } = req.body;

  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updateData: any = {};

    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (email !== undefined && email.trim() !== "") {
      const cleanEmail = email.toLowerCase().trim();
      if (cleanEmail !== existingUser.email.toLowerCase()) {
        const conflict = await User.findOne({ email: cleanEmail, _id: { $ne: id } });
        if (conflict) {
          return res.status(400).json({ success: false, message: "Email is already registered by another member." });
        }
        updateData.email = cleanEmail;
      }
    }
    if (studentId !== undefined && studentId.trim() !== "") {
      const cleanStudentId = studentId.trim();
      if (cleanStudentId !== existingUser.studentId) {
        const conflict = await User.findOne({ studentId: cleanStudentId, _id: { $ne: id } });
        if (conflict) {
          return res.status(400).json({ success: false, message: "Student ID is already registered by another member." });
        }
        updateData.studentId = cleanStudentId;
      }
    }
    if (contactNumber !== undefined) updateData.contactNumber = contactNumber.trim();
    if (address !== undefined) updateData.address = address;
    if (bio !== undefined) updateData.bio = bio;
    if (department !== undefined) updateData.department = department;
    if (session !== undefined) updateData.session = session;
    if (batch !== undefined) updateData.batch = batch;
    // Resolve cross-field role and graduation consistency
    const targetClubRole = clubRole !== undefined ? clubRole : (role === "member" && existingUser.clubRole === "alumni" ? "member" : undefined);
    const targetRole = role !== undefined ? role : (clubRole === "member" && existingUser.role === "alumni" ? "member" : undefined);

    if (targetRole !== undefined) updateData.role = targetRole;
    if (targetClubRole !== undefined) updateData.clubRole = targetClubRole;

    if (isGraduated !== undefined) {
      updateData.isGraduated = Boolean(isGraduated);
      if (!updateData.isGraduated) {
        updateData.passingYear = null;
        if (updateData.clubRole === "alumni" || (!clubRole && existingUser.clubRole === "alumni")) {
          updateData.clubRole = "member";
        }
        if (updateData.role === "alumni" || (!role && existingUser.role === "alumni")) {
          updateData.role = "member";
        }
      }
    } else {
      // Auto-infer graduation status if not explicitly passed
      if (updateData.clubRole === "member" || (targetRole === "member" && (existingUser.clubRole === "alumni" || existingUser.isGraduated))) {
        updateData.isGraduated = false;
        updateData.passingYear = null;
        if (!updateData.clubRole) updateData.clubRole = "member";
      } else if (updateData.clubRole === "alumni" || updateData.role === "alumni") {
        updateData.isGraduated = true;
      }
    }

    if (passingYear !== undefined) {
      updateData.passingYear = passingYear ? Number(passingYear) : null;
    }

    if (designation !== undefined) {
      updateData.designation = designation.trim();
      // Auto-sync clubRole if clubRole was not explicitly specified in the update
      if (clubRole === undefined && targetClubRole === undefined) {
        const dLower = designation.toLowerCase().trim();
        if (dLower.includes("advisor") || dLower.includes("patron")) {
          updateData.clubRole = "advisor";
        } else if (dLower === "" || dLower === "general member" || dLower === "member" || dLower === "club member") {
          const effectiveIsGraduated = updateData.isGraduated !== undefined ? updateData.isGraduated : existingUser.isGraduated;
          updateData.clubRole = effectiveIsGraduated ? "alumni" : "member";
        } else {
          updateData.clubRole = "executive";
        }
      }
    } else if (customRole !== undefined) {
      // Backward-compatible fallback if an older payload passes customRole
      updateData.designation = customRole.trim();
    }

    // If reverting an alumni to member and designation still has "alumni", reset to "General Member"
    if (updateData.clubRole === "member" && designation === undefined && (!existingUser.designation || existingUser.designation.toLowerCase().includes("alumni"))) {
      updateData.designation = "General Member";
    }
    if (applicationStatus !== undefined) updateData.applicationStatus = applicationStatus;
    if (profileStatus !== undefined) updateData.profileStatus = profileStatus;
    if (skills !== undefined) {
      updateData.skills = Array.isArray(skills)
        ? skills
        : typeof skills === "string"
        ? skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }
    if (website !== undefined) updateData.website = website;
    if (socialLinks !== undefined) {
      updateData.socialLinks = {
        ...(existingUser.socialLinks || {}),
        ...socialLinks,
      };
    }
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (imagePosition !== undefined) updateData.imagePosition = imagePosition;
    if (coverUrl !== undefined) updateData.coverUrl = coverUrl;
    if (coverPosition !== undefined) updateData.coverPosition = coverPosition;
    if (experiences !== undefined && Array.isArray(experiences)) updateData.experiences = experiences;
    if (education !== undefined && Array.isArray(education)) updateData.education = education;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json({
      status: "success",
      success: true,
      message: "Member updated successfully.",
      data: {
        user: updatedUser,
      },
    });
  } catch (error: any) {
    next(error);
  }
};

export const getPublicMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawQuery = (req.query.search || req.query.q || "").toString().trim();
    const filter: any = {
      applicationStatus: "approved",
      profileStatus: { $ne: "banned" },
    };

    if (rawQuery) {
      const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [
        { fullName: regex },
        { email: regex },
        { studentId: regex },
        { department: regex },
        { designation: regex },
        { customRole: regex },
      ];
    }

    const members = await User.find(filter)
      .select(
        "_id fullName email imageUrl imagePosition role clubRole customRole designation session batch department socialLinks bio isGraduated passingYear studentId"
      )
      .lean();

    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};

export const searchAssignableMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawQuery = (req.query.q || req.query.search || "").toString().trim();
    const category = (req.query.category || "").toString().trim().toLowerCase();

    if (!rawQuery || rawQuery.length < 1) {
      return res.status(200).json({
        success: true,
        message: "Search query is required",
        members: [],
        data: [],
      });
    }

    const escaped = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const queryFilter: any = {
      applicationStatus: "approved",
      profileStatus: { $ne: "deleted" },
      $or: [
        { fullName: regex },
        { email: regex },
        { studentId: regex },
        { department: regex },
        { designation: regex },
        { customRole: regex },
      ],
    };

    // On advisor panel, strictly restrict results to users who are either advisors or alumni
    if (category === "advisor") {
      queryFilter.$and = [
        {
          $or: [
            { clubRole: { $in: ["advisor", "alumni"] } },
            { role: "alumni" },
            { isGraduated: true },
          ],
        },
      ];
    }

    const members = await User.find(queryFilter)
      .select(
        "_id fullName email studentId department session batch designation customRole clubRole role imageUrl imagePosition isGraduated"
      )
      .limit(30)
      .sort({ fullName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      members,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};

export const adminCreateMember = async (req: Request, res: Response) => {
  try {
    let payload: any;
    if (req.body.data) {
      try {
        payload = JSON.parse(req.body.data);
      } catch {
        return res.status(400).json({ success: false, message: "Invalid JSON format" });
      }
    } else if (req.body && typeof req.body === "object" && (req.body.fullName || req.body.email)) {
      payload = { ...req.body };
    } else {
      return res.status(400).json({ success: false, message: "Missing member data" });
    }

    if (!payload.fullName || !payload.email) {
      return res.status(400).json({ success: false, message: "Full Name and Email are required" });
    }

    // Process image if uploaded
    let profileImageUrl = "";
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);
        profileImageUrl = uploadResult.url;
      } catch (err) {
        console.error("Image upload failed:", err);
      }
    }

    if (profileImageUrl) {
      payload.imageUrl = profileImageUrl;
    } else if (!payload.imageUrl) {
      payload.imageUrl = "";
    }

    // Format social links if provided
    payload.socialLinks = {
      facebook: payload.facebook || payload.socialLinks?.facebook || "",
      github: payload.github || payload.socialLinks?.github || "",
      linkedin: payload.linkedin || payload.socialLinks?.linkedin || "",
      codeforces: payload.codeforces || payload.socialLinks?.codeforces || "",
      codechef: payload.codechef || payload.socialLinks?.codechef || "",
      discord: payload.discord || payload.socialLinks?.discord || "",
    };

    // Defaults based on designation and clubRole
    if (payload.designation && !payload.clubRole) {
      const dLower = payload.designation.toLowerCase().trim();
      if (dLower.includes("advisor") || dLower.includes("patron")) {
        payload.clubRole = "advisor";
      } else if (dLower === "" || dLower === "general member" || dLower === "member" || dLower === "club member") {
        payload.clubRole = payload.isGraduated ? "alumni" : "member";
      } else {
        payload.clubRole = "executive";
      }
    }
    const clubRole = payload.clubRole || "member";
    payload.clubRole = clubRole;

    if (!payload.role || payload.role === "member") {
      payload.role = payload.systemRole || (clubRole === "advisor" ? "advisor" : "member");
    }

    if (!payload.studentId) {
      if (clubRole === "advisor") {
        payload.studentId = payload.facultyId || `FAC-${Date.now().toString().slice(-6)}`;
      } else if (clubRole === "alumni") {
        payload.studentId = payload.formerStudentId || `ALM-${Date.now().toString().slice(-6)}`;
      } else {
        payload.studentId = `STD-${Date.now().toString().slice(-6)}`;
      }
    }

    if (!payload.session) {
      payload.session = clubRole === "advisor" ? "Faculty" : "2021-22";
    }
    if (!payload.batch) {
      payload.batch = clubRole === "advisor" ? "Faculty" : `${payload.department || "CSE"}`;
    }
    if (!payload.department) {
      payload.department = "CSE";
    }
    if (!payload.contactNumber) {
      payload.contactNumber = "N/A";
    }

    if (clubRole === "alumni") {
      payload.isGraduated = true;
    }

    // Default password if not provided
    if (!payload.password) {
      payload.password = "MEC-CC@" + Math.floor(1000 + Math.random() * 9000);
    }

    // Direct approval & verification for admin created member
    payload.isVerified = true;
    payload.applicationStatus = "approved";
    payload.profileStatus = "active";
    payload.approvedAt = new Date();
    payload.emailVerifiedAt = new Date();
    payload.approvedBy = (req as any).user?.id || null;

    // Check unique email and studentId
    const exists = await User.findOne({
      $or: [{ email: payload.email.toLowerCase().trim() }, { studentId: payload.studentId }],
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: exists.email === payload.email.toLowerCase().trim()
          ? "Email already registered"
          : "Student/Faculty ID already registered",
      });
    }

    const newUser = new User(payload);
    await newUser.save();

    return res.status(201).json({
      success: true,
      message: `${clubRole === "advisor" ? "Advisor" : clubRole === "alumni" ? "Alumni" : "Member"} created and approved successfully!`,
      data: newUser,
    });
  } catch (err: any) {
    console.error("Admin create member error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};

/**
 * @desc  Public Member Lookup & Activity Check
 * @route GET /api/users/lookup/:identifier
 * @access Public
 */
export const getMemberActivityLookup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier } = req.params;
    if (!identifier || identifier.trim() === "") {
      return res.status(400).json({ success: false, message: "Student ID, Email, or Member ID is required." });
    }

    const clean = identifier.trim();

    // Query user by ObjectId, or exact studentId (case-insensitive), or email
    const userQuery: any = {
      $or: [
        { studentId: { $regex: new RegExp(`^${clean}$`, "i") } },
        { email: clean.toLowerCase() },
      ],
    };

    if (clean.match(/^[0-9a-fA-F]{24}$/)) {
      userQuery.$or.push({ _id: clean });
    }

    let user = await User.findOne(userQuery)
      .select("-password -verificationToken -verificationCode -passwordResetToken -passwordResetCode -role -security -contactNumber")
      .lean();

    // Fallback: partial search by fullName if clean query has at least 3 characters
    if (!user && clean.length >= 3) {
      user = await User.findOne({ fullName: { $regex: clean, $options: "i" } })
        .select("-password -verificationToken -verificationCode -passwordResetToken -passwordResetCode -role -security -contactNumber")
        .lean();
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `No club member record found matching "${clean}". Please verify the Student ID or email.`,
      });
    }

    // Parallel aggregation of user's club activities
    const [certificates, eventsAttended, winningEvents, projects, blogs] = await Promise.all([
      Certificate.find({ recipient: user._id })
        .populate("associatedEvent", "title slug date location category")
        .sort({ issueDate: -1 })
        .lean(),

      Event.find({ attendees: user._id })
        .select("title slug date location category coverImageUrl")
        .sort({ date: -1 })
        .lean(),

      Event.find({ "winners.members": user._id })
        .select("title slug date winners")
        .lean(),

      Project.find({ teamMembers: user._id })
        .select("title description status startDate endDate githubLink liveDemoLink requiredSkills")
        .sort({ startDate: -1 })
        .lean(),

      Blog.find({ author: user._id, isPublished: true })
        .select("title slug excerpt publishedAt views likesCount tags coverImageUrl")
        .sort({ publishedAt: -1 })
        .lean(),
    ]);

    // Extract individual contest awards / podium finishes
    const achievements: any[] = [];
    winningEvents.forEach((ev: any) => {
      ev.winners?.forEach((w: any) => {
        const isMemberWinner = w.members?.some((m: any) => m.toString() === user._id.toString());
        if (isMemberWinner) {
          achievements.push({
            eventId: ev._id,
            eventTitle: ev.title,
            eventSlug: ev.slug,
            eventDate: ev.date,
            position: w.position,
            teamName: w.teamName,
            prize: w.prize,
          });
        }
      });
    });

    const totalValidCerts = certificates.filter((c: any) => c.status !== "revoked").length;

    res.status(200).json({
      success: true,
      message: "Member activity record retrieved.",
      data: {
        member: {
          id: user._id,
          fullName: user.fullName,
          studentId: user.studentId,
          email: user.email,
          department: user.department,
          batch: user.batch,
          session: user.session,
          isGraduated: user.isGraduated,
          passingYear: user.passingYear,
          clubRole: user.clubRole || "member",
          designation: user.designation,
          imageUrl: user.imageUrl,
          coverUrl: user.coverUrl,
          socialLinks: user.socialLinks || {},
          isVerified: user.isVerified,
          applicationStatus: user.applicationStatus,
          joinedAt: (user as any).createdAt,
        },
        metrics: {
          eventsCount: eventsAttended.length,
          certificatesCount: totalValidCerts,
          achievementsCount: achievements.length,
          projectsCount: projects.length,
          blogsCount: blogs.length,
        },
        certificates,
        eventsAttended,
        achievements,
        projects,
        blogs,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════════════
   🏆 COMPETITIVE PROGRAMMING CLUB LEADERBOARD (REAL MEMBERS)
   ══════════════════════════════════════════════════════════════════ */
interface CachedCfData {
  rating: number;
  maxRating: number;
  rank: string;
  avatar?: string;
  solved: number;
  sheetSolved?: number;
  lastFetched: number;
}

const cfLeaderboardCache = new Map<string, CachedCfData>();
const CF_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function extractCfHandle(input?: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/(?:codeforces\.com\/profile\/)([\w.-]+)/i);
  if (match) return match[1];
  if (trimmed.includes("/")) return trimmed.split("/").filter(Boolean).pop() || "";
  return trimmed.replace(/^@/, "");
}

export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawMembers = await User.find({
      applicationStatus: "approved",
      clubRole: { $ne: "advisor" },
    })
      .select("_id fullName imageUrl clubRole customRole designation socialLinks studentId batch department session")
      .lean();

    // Exclude any advisor, patron, or faculty accounts from the competitive programming leaderboard
    const members = rawMembers.filter((m) => {
      if (m.clubRole === "advisor") return false;
      const desig = (m.designation || m.customRole || "").toLowerCase();
      if (desig.includes("advisor") || desig.includes("patron") || desig.includes("principal")) return false;
      if (m.batch?.toLowerCase() === "faculty" || m.session?.toLowerCase() === "faculty") return false;
      return true;
    });

    // Identify all handles
    const handleMemberMap = new Map<string, any>();
    for (const m of members) {
      const handle = extractCfHandle(m.socialLinks?.codeforces);
      if (handle) {
        handleMemberMap.set(handle.toLowerCase(), { member: m, originalHandle: handle });
      }
    }

    const handlesToFetch = Array.from(handleMemberMap.keys()).filter((h) => {
      const cached = cfLeaderboardCache.get(h);
      return !cached || Date.now() - cached.lastFetched > CF_CACHE_TTL;
    });

    if (handlesToFetch.length > 0) {
      try {
        const infoUrl = `https://codeforces.com/api/user.info?handles=${handlesToFetch.join(";")}`;
        const cfRes = await fetch(infoUrl, { signal: AbortSignal.timeout(6000) });
        if (cfRes.ok) {
          const cfData: any = await cfRes.json();
          if (cfData.status === "OK" && Array.isArray(cfData.result)) {
            for (const cfUser of cfData.result) {
              const lowerH = cfUser.handle.toLowerCase();
              const existing = cfLeaderboardCache.get(lowerH);
              cfLeaderboardCache.set(lowerH, {
                rating: cfUser.rating || 0,
                maxRating: cfUser.maxRating || 0,
                rank: cfUser.rank || "unrated",
                avatar: cfUser.avatar || "",
                solved: existing ? existing.solved : 0,
                lastFetched: Date.now(),
              });
            }
          }
        }

        // Fetch solved problem counts asynchronously
        await Promise.allSettled(
          handlesToFetch.map(async (h) => {
            try {
              const statusUrl = `https://codeforces.com/api/user.status?handle=${h}&from=1&count=5000`;
              const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(10000) });
              if (statusRes.ok) {
                const statusData: any = await statusRes.json();
                if (statusData.status === "OK" && Array.isArray(statusData.result)) {
                  const uniqueSolved = new Set<string>();
                  const sheetSolved = new Set<string>();
                  const solvedSubmissions: Array<{ contestId: number; name: string; rating?: number }> = [];

                  for (const s of statusData.result) {
                    if (s.verdict === "OK" && s.problem?.contestId && s.problem?.index) {
                      const contestId = Number(s.problem.contestId);
                      const index = String(s.problem.index).toUpperCase();
                      const fullId = `${contestId}${index}`;
                      if (!uniqueSolved.has(fullId)) {
                        uniqueSolved.add(fullId);
                        solvedSubmissions.push({
                          contestId,
                          name: s.problem.name || "",
                          rating: typeof s.problem.rating === "number" ? s.problem.rating : undefined,
                        });
                        if (CP_SHEET_PROBLEM_IDS.has(fullId)) {
                          sheetSolved.add(fullId);
                        }
                      }
                    }
                  }

                  // Twin round matching (Div 1 / Div 2 twin rounds or Gym mirrors)
                  for (const sub of solvedSubmissions) {
                    if (!sub.name || !sub.rating) continue;
                    const normSub = normalizeProblemTitle(sub.name);
                    const candidates = CP_SHEET_TITLE_INDEX.get(normSub);
                    if (candidates) {
                      for (const cp of candidates) {
                        if (!sheetSolved.has(cp.id) && cp.rating === sub.rating) {
                          const diff = Math.abs(sub.contestId - cp.contestId);
                          if (diff <= 10 || sub.contestId >= 100000) {
                            sheetSolved.add(cp.id);
                          }
                        }
                      }
                    }
                  }

                  const cached = cfLeaderboardCache.get(h);
                  if (cached) {
                    cached.solved = uniqueSolved.size;
                    cached.sheetSolved = sheetSolved.size;
                  }
                }
              }
            } catch {
              // Ignore single status fetch errors
            }
          })
        );
      } catch (cfErr) {
        console.warn("Codeforces API fetch error (using cached stats):", cfErr);
      }
    }

    // Assemble leaderboard
    const leaderboard = members.map((m) => {
      const handle = extractCfHandle(m.socialLinks?.codeforces);
      const cf = handle ? cfLeaderboardCache.get(handle.toLowerCase()) : null;

      return {
        userId: m._id.toString(),
        name: m.fullName,
        handle: handle || (m.studentId ? `ID: ${m.studentId}` : "Unlinked"),
        hasCfHandle: Boolean(handle),
        platform: "Codeforces",
        rating: cf?.rating || 0,
        maxRating: cf?.maxRating || 0,
        tier: cf?.rank || "unrated",
        solved: cf?.solved || 0,
        sheetSolved: cf?.sheetSolved ?? 0,
        avatar: cf?.avatar || m.imageUrl || "",
        imageUrl: m.imageUrl || "",
        designation: m.designation || m.customRole || (m.clubRole === "executive" ? "Executive Member" : m.clubRole === "advisor" ? "Advisor" : "Member"),
        department: m.department || "CSE",
        batch: m.batch || m.session || "",
        profileUrl: `/profile/${m._id.toString()}`,
      };
    });

    // Rank sorting: higher rating first, then solved, then name
    leaderboard.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.solved !== a.solved) return b.solved - a.solved;
      return a.name.localeCompare(b.name);
    });

    leaderboard.forEach((entry, idx) => {
      (entry as any).rank = idx + 1;
    });

    res.status(200).json({
      success: true,
      data: leaderboard,
      totalMembers: leaderboard.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userIdToDelete = req.params.id;
    const requester = (req as any).user;

    if (!userIdToDelete) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    if (requester?.id === userIdToDelete) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account from the dashboard." });
    }

    const user = await User.findById(userIdToDelete);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Permanently remove the user from MongoDB
    await User.findByIdAndDelete(userIdToDelete);

    res.status(200).json({
      success: true,
      message: `Member ${user.fullName} (${user.email}) was permanently deleted.`,
    });
  } catch (error) {
    next(error);
  }
};



