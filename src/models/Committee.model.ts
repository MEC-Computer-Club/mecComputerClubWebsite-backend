import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICommitteeMember {
  userId?: Types.ObjectId;
  name: string;
  role: string;
  order: number;
  department?: string;
  batch?: string;
  session?: string;
  imageUrl?: string;
  imagePosition?: string;
  socialLinks?: {
    facebook?: string;
    linkedin?: string;
    github?: string;
    email?: string;
    discord?: string;
    codeforces?: string;
    codechef?: string;
  };
  bio?: string;
}

export interface ICommittee extends Document {
  term: string; // e.g. "2026-2027", "2025-2026"
  title: string; // e.g. "Executive Committee 2026–2027"
  isCurrent: boolean;
  order: number; // e.g. 2026 for sorting descending
  session?: string;
  startDate?: Date;
  endDate?: Date;
  groupPhotoUrl?: string;
  description?: string;
  members: ICommitteeMember[];
  createdAt: Date;
  updatedAt: Date;
}

const committeeMemberSchema = new Schema<ICommitteeMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      required: [true, "Member name is required"],
      trim: true,
    },
    role: {
      type: String,
      required: [true, "Role or designation is required"],
      trim: true,
    },
    order: {
      type: Number,
      default: 99,
    },
    department: {
      type: String,
      trim: true,
      default: "CSE",
    },
    batch: {
      type: String,
      trim: true,
      default: "",
    },
    session: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    imagePosition: {
      type: String,
      default: "50% 50%",
    },
    socialLinks: {
      facebook: { type: String, trim: true, default: "" },
      linkedin: { type: String, trim: true, default: "" },
      github: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, default: "" },
      discord: { type: String, trim: true, default: "" },
      codeforces: { type: String, trim: true, default: "" },
      codechef: { type: String, trim: true, default: "" },
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const committeeSchema = new Schema<ICommittee>(
  {
    term: {
      type: String,
      required: [true, "Committee term is required (e.g. 2026-2027)"],
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Committee title is required"],
      trim: true,
    },
    isCurrent: {
      type: Boolean,
      default: false,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    session: {
      type: String,
      trim: true,
      default: "",
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    groupPhotoUrl: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    members: [committeeMemberSchema],
  },
  {
    timestamps: true,
  }
);

committeeSchema.index({ order: -1, createdAt: -1 });

export const Committee = mongoose.model<ICommittee>("Committee", committeeSchema);
export default Committee;
