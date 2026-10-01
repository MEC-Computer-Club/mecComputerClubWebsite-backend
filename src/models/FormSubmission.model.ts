import { Schema, model, Types } from "mongoose";

export interface IFormSubmission {
  formId: Types.ObjectId;
  userId?: Types.ObjectId;
  responses: Record<string, any>;
  status?: "pending" | "approved" | "rejected";
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
}

const SubmissionSchema = new Schema<IFormSubmission>(
  {
    formId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    responses: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default model<IFormSubmission>("FormSubmission", SubmissionSchema);
