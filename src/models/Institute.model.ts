import mongoose, { Document, Schema } from "mongoose";

export interface IInstitute extends Document {
  name: string;
  aliases?: string[];
  usageCount: {
    cgpaCalculations: number;
    coverPagePrints: number;
    total: number;
  };
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const instituteSchema: Schema<IInstitute> = new Schema(
  {
    name: {
      type: String,
      required: [true, "Institute name is required"],
      trim: true,
      unique: true,
    },
    aliases: [
      {
        type: String,
        trim: true,
      },
    ],
    usageCount: {
      cgpaCalculations: { type: Number, default: 0 },
      coverPagePrints: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

instituteSchema.index({ name: "text", aliases: "text" });
instituteSchema.index({ "usageCount.total": -1 });

export const Institute = mongoose.model<IInstitute>("Institute", instituteSchema);
export default Institute;
