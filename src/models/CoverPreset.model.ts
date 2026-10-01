import mongoose, { Document, Schema } from "mongoose";

export interface ICoverPreset extends Document {
  name: string;
  category: string;
  url: string;
  publicId?: string;
  description?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const coverPresetSchema = new Schema<ICoverPreset>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Community", trim: true },
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "" },
    description: { type: String, default: "", trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export const CoverPresetModel = mongoose.model<ICoverPreset>("CoverPreset", coverPresetSchema);
