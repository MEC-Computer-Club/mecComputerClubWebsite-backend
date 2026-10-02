import { Schema, model, Document } from "mongoose";

export type InvitationStatus = "consumable" | "consumed" | "expired" | "cancelled" | "discontinued";
export type InvitationCodeType = "single_use" | "permanent";

export interface IInvitationCode extends Document {
  code: string; // Unique code (e.g. 6-char OTP or custom permanent code)
  codeType: InvitationCodeType; // "single_use" vs "permanent" (reusable)
  email?: string; // Target user email (required for single_use, optional for permanent)
  label?: string; // Description or campaign name (e.g. "2026 Batch Recruitment")

  // Optional fields
  formId?: string; // Reference to membership form (submitted data)
  role?: "member" | "alumni" | "advisor" | "moderator" | "admin" | "guest";

  status: InvitationStatus;
  usageCount: number; // Number of registrations made with this code
  maxUses?: number; // 0 or undefined for unlimited

  requireApproval?: boolean; // If true, requires admin approval before login; if false, auto-approved

  createdBy?: Schema.Types.ObjectId; // User ID of Admin/Moderator who generated this code
  creatorName?: string; // Display name of creator

  expiresAt?: Date; // Expiration timestamp (optional / far future for permanent)

  createdAt: Date;
  updatedAt: Date;
}

const InvitationCodeSchema = new Schema<IInvitationCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    codeType: {
      type: String,
      enum: ["single_use", "permanent"],
      default: "single_use",
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: "",
    },

    label: {
      type: String,
      trim: true,
      default: "",
    },

    formId: {
      type: String,
    },

    role: {
      type: String,
      enum: ["member", "alumni", "advisor", "moderator", "admin", "guest"],
      default: "member",
    },

    status: {
      type: String,
      enum: ["consumable", "consumed", "expired", "cancelled", "discontinued"],
      default: "consumable",
      index: true,
    },

    usageCount: {
      type: Number,
      default: 0,
    },

    maxUses: {
      type: Number,
      default: 0,
    },

    requireApproval: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    creatorName: {
      type: String,
      trim: true,
      default: "",
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000), // Default 100 years for permanent
    },
  },
  { timestamps: true }
);

const InvitationCodeModel = model<IInvitationCode>("InvitationCode", InvitationCodeSchema);

// Drop old unique email_1 index if it exists in MongoDB so re-issuance works seamlessly
InvitationCodeModel.collection.dropIndex("email_1").catch(() => {});

export default InvitationCodeModel;
