import mongoose, { Schema, Document } from "mongoose";

export interface ICertificate extends Document {
  name: string;
  description?: string;
  recipient?: mongoose.Types.ObjectId;
  recipientName?: string;
  recipientEmail?: string;
  recipientStudentId?: string;
  recipientDepartment?: string;
  associatedEvent?: mongoose.Types.ObjectId;
  issueDate: Date;
  certificateId: string;
  digitalUrl?: string;
  type: "participation" | "winner" | "completion" | "achievement" | "appreciation" | "volunteer" | "organizer" | "other";
  position?: string; // for winner certificates: "1st Place", "Champion", etc.
  issuedBy?: mongoose.Types.ObjectId; // admin who issued it
  template?: mongoose.Types.ObjectId;
  status: "valid" | "revoked";
  revokedAt?: Date;
  revocationReason?: string;
}

const CertificateSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: false },
    recipientName: { type: String, trim: true },
    recipientEmail: { type: String, trim: true },
    recipientStudentId: { type: String, trim: true },
    recipientDepartment: { type: String, trim: true },
    associatedEvent: { type: Schema.Types.ObjectId, ref: "Event" },
    issueDate: { type: Date, required: true, default: Date.now },
    certificateId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    digitalUrl: { type: String, default: "" },
    type: {
      type: String,
      enum: ["participation", "winner", "completion", "achievement", "appreciation", "volunteer", "organizer", "other"],
      default: "participation",
    },
    position: { type: String, trim: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
    template: { type: Schema.Types.ObjectId, ref: "CertificateTemplate" },
    status: {
      type: String,
      enum: ["valid", "revoked"],
      default: "valid",
    },
    revokedAt: { type: Date },
    revocationReason: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Certificate = mongoose.model<ICertificate>("Certificate", CertificateSchema);
