import mongoose, { Document, Schema } from "mongoose";

export interface IDesignation extends Document {
  title: string;
  slug: string;
  category: "executive" | "advisor" | "general" | "alumni";
  order: number;
  maxSeats?: number;
  defaultRole?: "admin" | "moderator" | "member";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const designationSchema: Schema<IDesignation> = new Schema(
  {
    title: {
      type: String,
      required: [true, "Designation title is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["executive", "advisor", "general", "alumni"],
      default: "executive",
      required: true,
    },
    order: {
      type: Number,
      default: 1,
      required: true,
    },
    maxSeats: {
      type: Number,
      default: null,
    },
    defaultRole: {
      type: String,
      enum: ["admin", "moderator", "member"],
      default: "member",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique titles within the same category
designationSchema.index({ title: 1, category: 1 }, { unique: true });
designationSchema.index({ category: 1, order: 1 });

export const Designation = mongoose.model<IDesignation>("Designation", designationSchema);
export default Designation;
