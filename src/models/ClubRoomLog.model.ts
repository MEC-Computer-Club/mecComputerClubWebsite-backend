import mongoose, { Schema, Document } from "mongoose";

export interface IClubRoomLog extends Document {
  status: "open" | "closed";
  openedAt?: Date;
  closedAt?: Date;
  durationMinutes?: number;
  actor: mongoose.Types.ObjectId;
  actorName: string;
  actorEmail?: string;
  actorRole?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ClubRoomLogSchema = new Schema<IClubRoomLog>(
  {
    status: {
      type: String,
      enum: ["open", "closed"],
      required: true,
      index: true,
    },
    openedAt: {
      type: Date,
      index: true,
    },
    closedAt: {
      type: Date,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    actorEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    actorRole: {
      type: String,
      default: "executive",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

ClubRoomLogSchema.index({ createdAt: -1 });
ClubRoomLogSchema.index({ openedAt: -1 });

export const ClubRoomLog = mongoose.model<IClubRoomLog>("ClubRoomLog", ClubRoomLogSchema);
export default ClubRoomLog;
