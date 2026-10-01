import User, { IUser } from "../models/User.model";
import { ProfessionalCareer } from "../models/ProfessionalCareer.model";
import crypto from "crypto";
import { sendEmail } from "../utils/sendEmail";
import { generateEmail } from "../utils/generateEmailTemplate";
import { generateOtpCode } from "../utils/generateInviteCode";
import InvitationCodeModel from "../models/InvitationCode.model";
import AppError from "../utils/AppError";
import { getRegistrationApprovalEmailRecipients } from "../controllers/emailRouting.controller";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const createUser = async (payload: Partial<IUser>, validatedInviteDoc?: any) => {
  // 1. Resolve & Enforce Invitation Clearance
  let inviteDoc = validatedInviteDoc;
  if (!inviteDoc && (payload as any).inviteCode) {
    inviteDoc = await InvitationCodeModel.findOne({
      code: (payload as any).inviteCode.toString().trim().toUpperCase(),
    });
  }

  if (!inviteDoc) {
    throw new AppError("A valid invitation clearance code is strictly required to register.", 403);
  }

  // Pre-validate invitation clearance state
  if (inviteDoc.status === "discontinued" || inviteDoc.status === "cancelled") {
    throw new AppError("This invitation code has been discontinued or cancelled.", 403);
  }
  if (inviteDoc.status === "consumed") {
    throw new AppError("This single-use invitation code has already been consumed.", 403);
  }
  if (inviteDoc.expiresAt && inviteDoc.expiresAt < new Date()) {
    inviteDoc.status = "expired";
    await inviteDoc.save();
    throw new AppError("This invitation code has expired.", 410);
  }
  if (inviteDoc.maxUses && inviteDoc.maxUses > 0 && inviteDoc.usageCount >= inviteDoc.maxUses) {
    throw new AppError("This invitation code has reached its maximum usage limit.", 403);
  }

  // 2. Atomically Consume / Increment Code
  if (inviteDoc.codeType === "permanent") {
    // Permanent codes remain consumable and only increment usageCount
    await InvitationCodeModel.findByIdAndUpdate(inviteDoc._id, {
      $inc: { usageCount: 1 },
    });
  } else {
    // Single-use codes are atomically marked consumed to prevent race conditions
    const updated = await InvitationCodeModel.findOneAndUpdate(
      { _id: inviteDoc._id, status: "consumable" },
      {
        $set: { status: "consumed" },
        $inc: { usageCount: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError("This single-use invitation code has already been consumed.", 403);
    }
  }

  // 3. Create User
  const user = new User(payload);

  // Enforce invitation clearance role onto user document
  if (inviteDoc?.role) {
    const invRole = inviteDoc.role.toLowerCase().trim();
    if (invRole === "admin") {
      user.role = "admin";
      user.clubRole = "member";
      user.applicationStatus = "approved";
    } else if (invRole === "moderator") {
      user.role = "moderator";
      user.clubRole = "member";
      user.applicationStatus = "approved";
    } else if (invRole === "executive") {
      user.role = "executive";
      user.clubRole = "executive";
      user.applicationStatus = "approved";
    } else if (invRole === "alumni") {
      user.role = "alumni";
      user.clubRole = "alumni";
      user.isGraduated = true;
    } else if (invRole === "advisor") {
      user.role = "advisor";
      user.clubRole = "advisor";
      user.applicationStatus = "approved";
      user.approvedAt = new Date();
      user.profileStatus = "active";
    } else {
      user.role = user.role && user.role !== "guest" ? user.role : "member";
      user.clubRole = user.clubRole || "member";
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
      user.applicationStatus = "approved";
      user.approvedAt = new Date();
      user.profileStatus = "active";
    }
  }

  const { token, code } = user.generateEmailVerification();
  await user.save();

  // 4. Send Email Verification
  try {
    const verifyLink = `${FRONTEND_URL}/verify-email?token=${token}&email=${encodeURIComponent(
      user.email
    )}`;

    const htmlTemplate = generateEmail("emailVerification", {
      userName: user.fullName,
      link: verifyLink,
      code,
    });

    await sendEmail(user.email, "Verify your MEC Computer Club account", htmlTemplate);
  } catch (mailErr) {
    console.warn("Failed to send verification email:", mailErr);
  }

  return user;
};

export const findByEmail = async (email: string) => {
  return User.findOne({ email });
};

export const verifyUserByToken = async (email: string, token: string) => {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    email,
    verificationToken: hashed,
    verificationTokenExpiry: { $gt: new Date() },
  });
  if (!user) throw new Error("Invalid or expired token");

  user.isVerified = true;
  if (user.applicationStatus !== "approved") {
    user.applicationStatus = "pending";
  }
  user.emailVerifiedAt = new Date();
  user.verificationCode = undefined;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  // Notify admins via email ONLY if user requires approval
  if (user.applicationStatus !== "approved") {
    try {
      const recipients = await getRegistrationApprovalEmailRecipients();
      if (recipients.length > 0) {
        const emailTemplate = generateEmail("adminMailForMemberRegistration", {
          userName: user.fullName,
          email: user.email,
          contactNumber: user.contactNumber || "N/A",
          session: user.session,
          department: user.department,
          batch: user.batch,
          studentId: user.studentId,
          link: `${FRONTEND_URL}/dashboard/member-approvals/${user._id}`,
          userImageUrl: user.imageUrl,
        });
        await sendEmail(
          recipients.join(", "),
          "New member needs approval - MEC CC",
          emailTemplate
        );
      }
    } catch (mailErr) {
      console.error("Failed to notify admins of new member application:", mailErr);
    }
  }

  return user;
};

export const verifyUserByCode = async (email: string, code: string) => {
  const user = await User.findOne({ email, verificationCode: code });
  if (!user) throw new Error("Invalid code");
  // optional: check expiry if you want code to expire with token
  user.isVerified = true;
  if (user.applicationStatus !== "approved") {
    user.applicationStatus = "pending";
  }
  user.emailVerifiedAt = new Date();
  user.verificationCode = undefined;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;

  // Notify admins via email ONLY if user requires approval
  if (user.applicationStatus !== "approved") {
    try {
      const recipients = await getRegistrationApprovalEmailRecipients();
      if (recipients.length > 0) {
        const emailTemplate = generateEmail("adminMailForMemberRegistration", {
          userName: user.fullName,
          email: user.email,
          contactNumber: user.contactNumber || "N/A",
          session: user.session,
          department: user.department,
          batch: user.batch,
          studentId: user.studentId,
          link: `${FRONTEND_URL}/dashboard/member-approvals/${user._id}`,
          userImageUrl: user.imageUrl,
        });
        await sendEmail(
          recipients.join(", "),
          "New member needs approval - MEC CC",
          emailTemplate
        );
      }
    } catch (mailErr) {
      console.error("Failed to notify admins of new member application:", mailErr);
    }
  }

  await user.save();
  return user;
};

export const requestFastVerification = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const now = new Date();

  // reset count if new day
  const lastReq = user.lastFastVerificationRequest;
  if (!lastReq || lastReq.toDateString() !== now.toDateString()) {
    user.requestedFastVerificationCount = 0;
  }

  if (user.requestedFastVerificationCount >= 2) {
    throw new Error("Maximum fast verification requests reached for today");
  }

  if (user.lastFastVerificationRequest) {
    const diff = now.getTime() - user.lastFastVerificationRequest.getTime();
    if (diff < 30 * 60 * 1000) {
      throw new Error("You must wait 30 minutes between fast verification requests");
    }
  }

  user.requestedFastVerificationCount += 1;
  user.lastFastVerificationRequest = now;
  await user.save();

  // send email to admins requesting fast verification (admin should verify and hit approve endpoint)
  // implement admin list or single admin email
  // sendEmail(adminEmail, "User requested fast verification", "user details..")

  return user;
};

export const createPasswordReset = async (email: string) => {
  const user = await User.findOne({ email }).select(
    "+passwordResetToken +passwordResetExpiry +password"
  );
  if (!user) throw new Error("User not found");
  const resetToken = user.generatePasswordReset();

  const otpCode = generateOtpCode();
  user.passwordResetCode = otpCode;
  await user.save();

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(
    email
  )}`;
  const htmlTemplate = generateEmail("passwordReset", {
    userName: user.fullName,
    link: resetUrl,
    code: otpCode,
  });
  await sendEmail(email, "Reset your password - MEC Computer Club", htmlTemplate);
  return resetToken;
};

export const resetPassword = async (email: string, token: string, newPassword: string) => {
  const code = token.length === 6 ? token : null;
  let user;
  if (code) {
    user = await User.findOne({
      email,
      passwordResetCode: code,
      passwordResetExpiry: { $gt: new Date() },
    }).select("+password");
  } else {
    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    user = await User.findOne({
      email,
      passwordResetToken: hashed,
      passwordResetExpiry: { $gt: new Date() },
    }).select("+password");
  }
  if (!user) throw new Error("Invalid or expired reset token");

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetCode = undefined;
  user.passwordResetExpiry = undefined;
  await user.save();
  return user;
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  if (!currentPassword) {
    throw new Error("Current password is required.");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters long.");
  }
  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User not found.");

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new Error("Incorrect current password. Please enter your valid current password.");
  }
  if (currentPassword === newPassword) {
    throw new Error("New password cannot be the same as your current password.");
  }

  user.password = newPassword;
  await user.save();
  return user;
};

export const getPublicUserProfile = async (identifier: string) => {
  let user: IUser | null = null;
  const projection = "-password -verificationToken -passwordResetToken -contactNumber -security";
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    user = await User.findById(identifier).select(projection);
  } else if (identifier.includes("@")) {
    user = await User.findOne({ email: identifier }).select(projection);
  } else {
    // Try studentId first, then fall back to fullName (case-insensitive, partial match)
    user = await User.findOne({ studentId: identifier }).select(projection);
    if (!user) {
      user = await User.findOne({
        fullName: { $regex: identifier, $options: "i" },
      }).select(projection);
    }
  }
  if (!user) throw new Error("User not found");
  return user;
};


export const getUserProfile = async (identifier: string) => {
  let user: IUser | null = null;
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    user = await User.findById(identifier).select(
      "-password -verificationToken -passwordResetToken"
    );
  } else if (identifier.includes("@")) {
    user = await User.findOne({ email: identifier }).select(
      "-password -verificationToken -passwordResetToken"
    );
  } else {
    user = await User.findOne({ studentId: identifier }).select(
      "-password -verificationToken -passwordResetToken"
    );
  }
  if (!user) throw new Error("User not found");
  return user;
};

export const userFromToken = async (tokenPayload: { id: string; email: string; role: string }) => {
  const user = await User.findById(tokenPayload.id).select(
    "-password -verificationToken -passwordResetToken"
  );
  if (!user) throw new Error("User not found");
  return user;
};
