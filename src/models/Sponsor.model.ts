import mongoose, { Schema, Document } from "mongoose";

export interface ISponsorshipRecord {
  sponsorshipType: "event" | "duration";
  eventId?: mongoose.Types.ObjectId;
  eventName?: string;   // denormalised for display without populate
  tier?: string;        // e.g. Gold Sponsor, Silver Sponsor, Food Sponsor
  startDate?: Date;
  endDate?: Date;
  contributionType: "monetary" | "in_kind" | "service";
  amountOrValue: number;
  notes?: string;
  createdAt?: Date;
}

export interface ISponsor extends Document {
  name: string;
  logoUrl: string;
  website?: string;
  isActive: boolean;
  showOnHome: boolean;  // Featured on homepage
  contactName?: string;
  contactEmail?: string;
  category: "sponsor" | "club_as_partner";
  role?: string;        // e.g. Community Partner, Club Partner, Co-Organizer
  tier?: string;        // Global tier if applicable
  description?: string;
  startDate?: Date;
  endDate?: Date;
  // All individual sponsorship records (one sponsor can sponsor many times)
  sponsorships: ISponsorshipRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const SponsorshipRecordSchema = new Schema<ISponsorshipRecord>(
  {
    sponsorshipType: {
      type: String,
      enum: ["event", "duration"],
      required: true,
      default: "event",
    },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    eventName: { type: String, trim: true },
    tier: { type: String, trim: true, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
    contributionType: {
      type: String,
      enum: ["monetary", "in_kind", "service"],
      required: true,
      default: "monetary",
    },
    amountOrValue: { type: Number, default: 0 },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SponsorSchema: Schema = new Schema(
  {
    name: { type: String, required: [true, "Sponsor name is required"], trim: true },
    logoUrl: { type: String, default: "" },
    website: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    showOnHome: { type: Boolean, default: false },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    category: {
      type: String,
      enum: ["sponsor", "club_as_partner"],
      default: "sponsor",
    },
    role: { type: String, trim: true, default: "" },
    tier: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
    sponsorships: { type: [SponsorshipRecordSchema], default: [] },
  },
  { timestamps: true }
);

export const Sponsor = mongoose.model<ISponsor>("Sponsor", SponsorSchema);
