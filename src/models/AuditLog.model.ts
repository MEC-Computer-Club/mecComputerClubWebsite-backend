import mongoose, { Schema, Document } from "mongoose";

export type AuditActionType =
  | "CREATE"
  | "UPDATE"
  | "STATUS_CHANGE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "PUBLISH"
  | "EXPORT"
  | "ROOM_OPEN"
  | "ROOM_CLOSE"
  | "LOGIN"
  | "ROLE_CHANGE";

export type AuditTargetType =
  | "ASSET"
  | "MEMBER"
  | "EVENT"
  | "PAGE"
  | "INVITATION"
  | "CLUB_ROOM"
  | "CERTIFICATE"
  | "FORM"
  | "SYSTEM";

export interface IAuditDiffItem {
  field: string;
  previousValue?: any;
  newValue?: any;
}

export interface IAuditLog extends Document {
  timestamp: Date;
  actor?: mongoose.Types.ObjectId;
  actorName: string;
  actorEmail?: string;
  actorRole: string; // "admin" | "moderator" | "executive" | "system"
  action: AuditActionType;
  targetType: AuditTargetType;
  targetId?: string;
  targetTitle: string;
  description: string;
  diff?: IAuditDiffItem[];
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditDiffItemSchema = new Schema<IAuditDiffItem>(
  {
    field: { type: String, required: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const AuditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    actorRole: {
      type: String,
      default: "admin",
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      trim: true,
    },
    targetTitle: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    diff: {
      type: [AuditDiffItemSchema],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful indices for lightning-fast queries and date filtering
AuditLogSchema.index({ targetType: 1, action: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
export default AuditLog;
