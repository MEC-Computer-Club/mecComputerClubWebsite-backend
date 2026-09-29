import mongoose, { Document, Schema } from "mongoose";

export interface IQuestionArchive extends Document {
  title: string;
  department: string;
  semester: number;
  year: number;
  session?: string;
  examType: string;
  courseCode: string;
  courseName: string;
  course?: mongoose.Types.ObjectId | null;
  fileUrl: string;
  filePublicId?: string;
  fileName?: string;
  fileSize?: number;
  fileType: "pdf" | "image" | "document";
  mimeType?: string;
  description?: string;
  tags?: string[];
  status: "published" | "draft" | "archived";
  downloadCount: number;
  viewCount: number;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionArchiveSchema: Schema<IQuestionArchive> = new Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    semester: {
      type: Number,
      required: [true, "Semester is required"],
      min: 1,
      index: true,
    },
    year: {
      type: Number,
      required: [true, "Exam year is required"],
      index: true,
    },
    session: {
      type: String,
      trim: true,
      default: "",
    },
    examType: {
      type: String,
      required: [true, "Exam type is required"],
      trim: true,
      index: true,
    },
    courseCode: {
      type: String,
      required: [true, "Course code is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    courseName: {
      type: String,
      required: [true, "Course name is required"],
      trim: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    fileUrl: {
      type: String,
      required: [true, "File URL is required"],
      trim: true,
    },
    filePublicId: {
      type: String,
      trim: true,
      default: "",
    },
    fileName: {
      type: String,
      trim: true,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    fileType: {
      type: String,
      enum: ["pdf", "image", "document"],
      default: "pdf",
      index: true,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["published", "draft", "archived"],
      default: "published",
      index: true,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast multi-attribute filtering & sorting
QuestionArchiveSchema.index({ department: 1, year: -1, semester: 1 });
QuestionArchiveSchema.index({ department: 1, semester: 1, examType: 1 });
QuestionArchiveSchema.index({ courseCode: 1, year: -1 });
QuestionArchiveSchema.index({ year: -1, createdAt: -1 });

// Full text search index
QuestionArchiveSchema.index(
  {
    title: "text",
    courseCode: "text",
    courseName: "text",
    department: "text",
    tags: "text",
    description: "text",
  },
  {
    weights: {
      courseCode: 10,
      title: 8,
      courseName: 6,
      department: 4,
      tags: 2,
      description: 1,
    },
    name: "QuestionArchiveTextIndex",
  }
);

export default mongoose.models.QuestionArchive ||
  mongoose.model<IQuestionArchive>("QuestionArchive", QuestionArchiveSchema);
