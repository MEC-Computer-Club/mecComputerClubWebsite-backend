import mongoose, { Schema, Document } from "mongoose";

export interface IFeatureItem {
  title: string;
  desc?: string;
}

export interface IDeveloper extends Document {
  id: string; // studentId or unique identifier (e.g. "210347")
  name: string;
  role: string;
  department: string;
  batch: string;
  session: string;
  featuresWorkedOn: IFeatureItem[];
  profileUrl: string;
  github: string;
  initials: string;
  avatarBg: string;
  photo?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FeatureItemSchema = new Schema<IFeatureItem>(
  {
    title: { type: String, required: true, trim: true },
    desc: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const DeveloperSchema = new Schema<IDeveloper>(
  {
    id: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: "Department of CSE" },
    batch: { type: String, trim: true, default: "5th Batch" },
    session: { type: String, trim: true, default: "2021-2022" },
    featuresWorkedOn: { type: [FeatureItemSchema], default: [] },
    profileUrl: { type: String, trim: true, default: "" },
    github: { type: String, trim: true, default: "" },
    initials: { type: String, trim: true, default: "" },
    avatarBg: {
      type: String,
      trim: true,
      default: "from-lime-500 via-emerald-500 to-teal-600",
    },
    photo: { type: String, trim: true, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Developer = mongoose.model<IDeveloper>("Developer", DeveloperSchema);
export default Developer;
