import mongoose, { Document, Schema } from "mongoose";

export interface IToolUsage extends Document {
  tool: "cgpa_calculator" | "cover_page";
  action: "calculate" | "print" | "export_pdf";
  instituteName: string;
  department?: string;
  session?: string;
  semester?: number;
  userId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const toolUsageSchema: Schema<IToolUsage> = new Schema(
  {
    tool: {
      type: String,
      enum: ["cgpa_calculator", "cover_page"],
      required: true,
    },
    action: {
      type: String,
      enum: ["calculate", "print", "export_pdf"],
      required: true,
    },
    instituteName: {
      type: String,
      required: true,
      trim: true,
      default: "Mymensingh Engineering College",
    },
    department: {
      type: String,
      trim: true,
    },
    session: {
      type: String,
      trim: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 8,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

toolUsageSchema.index({ tool: 1, action: 1 });
toolUsageSchema.index({ instituteName: 1 });
toolUsageSchema.index({ createdAt: -1 });

export const ToolUsage = mongoose.model<IToolUsage>("ToolUsage", toolUsageSchema);
export default ToolUsage;
