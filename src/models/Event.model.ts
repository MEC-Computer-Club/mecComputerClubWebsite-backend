import mongoose, { Schema, Document } from "mongoose";

export interface IWinner {
  teamName?: string;                          // optional team name
  members: mongoose.Types.ObjectId[];         // 1–N members in the team
  position: string;                           // "1st Place", "Best Design", etc.
  prize?: string;
}

export interface ITeamMember {
  fullName: string;
  studentId?: string;
  email?: string;
  phone?: string;
  inGameId?: string;
  department?: string;
}

export interface IApprovedParticipant {
  _id?: string;
  userId?: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  studentId?: string;
  department?: string;
  phone?: string;
  teamName?: string;
  inGameId?: string;
  isTeamLeader?: boolean;
  approvedAt?: Date;
}

export interface IPendingParticipant {
  userId?: mongoose.Types.ObjectId;
  teamName?: string;
  leaderName?: string;
  leaderEmail?: string;
  leaderPhone?: string;
  leaderStudentId?: string;
  inGameId?: string;
  members?: ITeamMember[];
  registeredAt: Date;
  formData?: Record<string, any>;
}

export interface IEventReward {
  position: string; // e.g. "1st Place (Champion)", "2nd Place (Runner-up)"
  prize: string;    // e.g. "15,000 BDT + Trophy & Jerseys"
}

export interface IEventScheduleItem {
  time: string;     // e.g. "10:00 AM" or "Day 1 - 02:00 PM"
  title: string;    // e.g. "Opening Ceremony & Team Briefing"
  description?: string;
}

export interface IEventSponsor {
  sponsorId: mongoose.Types.ObjectId;
  sponsorName: string;
  logoUrl?: string;
  tier?: string; // "Gold", "Silver", "Bronze", "Partner"
}

export interface IParticipationClaim {
  _id?: string;
  userId?: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  studentId?: string;
  department?: string;
  phone?: string;
  role: string; // "Participant", "Volunteer", "Speaker", "Organizer", "Contestant", etc.
  notes?: string;
  status: "pending" | "approved" | "rejected";
  claimedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
}

export interface IEventContributor {
  _id?: string;
  name: string;
  role: string; // e.g. "Lead Organizer", "Event Volunteer", "Technical Team", "Logistics", "Stage & Media", "Judge"
  department?: string;
  studentId?: string;
  email?: string;
  userId?: mongoose.Types.ObjectId;
  avatarUrl?: string;
}

export interface ISavedEventEmailTemplate {
  _id?: mongoose.Types.ObjectId;
  name: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  audience?: string;
  bannerUrl?: string;
  attachments?: Array<{
    name: string;
    url: string;
    size?: number;
    mimeType?: string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IEvent extends Document {
  title: string;
  slug?: string;
  description: string;
  date: Date;
  endDate?: Date;
  eventTime?: string;
  location: string;
  onlineLink?: string;
  category: "workshop" | "seminar" | "contest" | "conference" | "hackathon" | "gaming" | "social" | "other";
  status: "scheduled" | "ongoing" | "completed" | "cancelled" | "postponed";
  isUpcoming?: boolean;
  // Registration
  registrationType: "individual" | "team";
  teamSize?: { min: number; max: number };
  registrationLink?: string;
  registrationDeadline?: Date;
  maxParticipants?: number;
  registrationFee?: number;
  // Past Event Archiving & Claims
  allowParticipationClaims?: boolean;
  participationClaims: IParticipationClaim[];
  contributors: IEventContributor[];
  // Tournament / Event Highlights
  prizePool?: string;
  rewards: IEventReward[];
  schedule: IEventScheduleItem[];
  rules: string[];
  coverImageUrl?: string;
  coverImagePosition?: string;
  bannerImageUrl?: string;
  bannerImagePosition?: string;
  // Organiser
  organizer?: string;
  organizerType?: "mec_cc" | "other";
  organizerLogoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Tags & visibility
  tags: string[];
  isPublished: boolean;
  notificationSent?: boolean;
  // Custom HTML section
  customHtmlSection?: string;
  // Participants
  attendees: mongoose.Types.ObjectId[];           // approved member user IDs
  approvedParticipants: IApprovedParticipant[];   // rich list of all approved participants (members & non-members)
  pendingParticipants: IPendingParticipant[];      // awaiting admin approval
  // Winners (for contests/hackathons)
  winners: IWinner[];
  // Sponsors linked to this event
  eventSponsors: IEventSponsor[];
  // Relations
  media: mongoose.Types.ObjectId[];
  certificates: mongoose.Types.ObjectId[];
  projects: mongoose.Types.ObjectId[];
  forms: mongoose.Types.ObjectId[];
  linkedForm?: mongoose.Types.ObjectId;
  providesCertificate?: boolean;
  registeredCount?: number;
  // Event Custom Saved Email Templates
  savedEmailTemplates?: ISavedEventEmailTemplate[];
  createdBy?: mongoose.Types.ObjectId;
  createdByName?: string;
  lastUpdatedBy?: mongoose.Types.ObjectId;
  lastUpdatedByName?: string;
}

const WinnerSchema = new Schema<IWinner>({
  teamName: { type: String, trim: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
  position: { type: String, required: true, trim: true },
  prize: { type: String, trim: true },
}, { _id: true });

const TeamMemberSchema = new Schema<ITeamMember>({
  fullName: { type: String, required: true, trim: true },
  studentId: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  inGameId: { type: String, trim: true },
  department: { type: String, trim: true },
}, { _id: false });

const ApprovedParticipantSchema = new Schema<IApprovedParticipant>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  studentId: { type: String, trim: true },
  department: { type: String, trim: true },
  phone: { type: String, trim: true },
  teamName: { type: String, trim: true },
  inGameId: { type: String, trim: true },
  isTeamLeader: { type: Boolean, default: false },
  approvedAt: { type: Date, default: Date.now },
}, { _id: true });

const PendingParticipantSchema = new Schema<IPendingParticipant>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  teamName: { type: String, trim: true },
  leaderName: { type: String, trim: true },
  leaderEmail: { type: String, trim: true },
  leaderPhone: { type: String, trim: true },
  leaderStudentId: { type: String, trim: true },
  inGameId: { type: String, trim: true },
  members: { type: [TeamMemberSchema], default: [] },
  registeredAt: { type: Date, default: Date.now },
  formData: { type: Schema.Types.Mixed },
}, { _id: true });

const EventRewardSchema = new Schema<IEventReward>({
  position: { type: String, required: true, trim: true },
  prize: { type: String, required: true, trim: true },
}, { _id: false });

const EventScheduleItemSchema = new Schema<IEventScheduleItem>({
  time: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
}, { _id: false });

const EventSponsorSchema = new Schema<IEventSponsor>({
  sponsorId: { type: Schema.Types.ObjectId, ref: "Sponsor", required: true },
  sponsorName: { type: String, required: true, trim: true },
  logoUrl: { type: String },
  tier: { type: String, trim: true },
}, { _id: true });

const ParticipationClaimSchema = new Schema<IParticipationClaim>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: false },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  studentId: { type: String, trim: true },
  department: { type: String, trim: true },
  phone: { type: String, trim: true },
  role: { type: String, default: "Participant", trim: true },
  notes: { type: String, trim: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  claimedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { _id: true });

const EventContributorSchema = new Schema<IEventContributor>({
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  studentId: { type: String, trim: true },
  email: { type: String, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  avatarUrl: { type: String },
}, { _id: true });

const SavedEventEmailTemplateSchema = new Schema<ISavedEventEmailTemplate>(
  {
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    isHtml: { type: Boolean, default: false },
    audience: { type: String, default: "approved_participants" },
    bannerUrl: { type: String, trim: true },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: false },
        content: { type: String, required: false },
        size: { type: Number },
        mimeType: { type: String },
      },
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const EventSchema: Schema = new Schema(
  {
    title: { type: String, required: [true, "Event title is required"], trim: true },
    slug: { type: String, trim: true },
    description: { type: String, required: [true, "Event description is required"], trim: true },
    date: { type: Date, required: [true, "Event date is required"], index: true },
    endDate: { type: Date },
    eventTime: { type: String },
    location: { type: String, required: [true, "Event location is required"], trim: true },
    onlineLink: { type: String },
    category: {
      type: String,
      enum: ["workshop", "seminar", "contest", "conference", "hackathon", "gaming", "social", "other"],
      default: "seminar",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled", "postponed"],
      default: "scheduled",
    },
    registrationType: {
      type: String,
      enum: ["individual", "team"],
      default: "individual",
    },
    teamSize: {
      min: { type: Number, default: 1 },
      max: { type: Number, default: 4 },
    },
    registrationLink: { type: String },
    registrationDeadline: { type: Date },
    maxParticipants: { type: Number },
    registrationFee: { type: Number, default: 0 },
    providesCertificate: { type: Boolean, default: false },
    // Past Event Archiving & Participation Claims
    allowParticipationClaims: { type: Boolean, default: false },
    participationClaims: { type: [ParticipationClaimSchema], default: [] },
    contributors: { type: [EventContributorSchema], default: [] },
    // Tournament & Highlights
    prizePool: { type: String, trim: true },
    rewards: { type: [EventRewardSchema], default: [] },
    schedule: { type: [EventScheduleItemSchema], default: [] },
    rules: { type: [String], default: [] },
    // Media
    coverImageUrl: { type: String },
    coverImagePosition: { type: String, default: "50% 50%" },
    bannerImageUrl: { type: String },
    bannerImagePosition: { type: String, default: "50% 50%" },
    organizer: { type: String, trim: true },
    organizerType: { type: String, enum: ["mec_cc", "other"], default: "mec_cc" },
    organizerLogoUrl: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    tags: { type: [String], default: [] },
    isPublished: { type: Boolean, default: true },
    notificationSent: { type: Boolean, default: false },
    customHtmlSection: { type: String },
    // Participants
    attendees: [{ type: Schema.Types.ObjectId, ref: "User" }],
    approvedParticipants: { type: [ApprovedParticipantSchema], default: [] },
    pendingParticipants: { type: [PendingParticipantSchema], default: [] },
    // Winners
    winners: { type: [WinnerSchema], default: [] },
    // Sponsors
    eventSponsors: { type: [EventSponsorSchema], default: [] },
    // Relations
    media: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    certificates: [{ type: Schema.Types.ObjectId, ref: "Certificate" }],
    projects: [{ type: Schema.Types.ObjectId, ref: "Project" }],
    forms: [{ type: Schema.Types.ObjectId, ref: "Form" }],
    linkedForm: { type: Schema.Types.ObjectId, ref: "Form" },
    savedEmailTemplates: { type: [SavedEventEmailTemplateSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    createdByName: { type: String, trim: true },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastUpdatedByName: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

EventSchema.index({ isPublished: 1, date: -1 });
EventSchema.index({ slug: 1 });
EventSchema.index({ status: 1, date: -1 });

EventSchema.virtual("isUpcoming").get(function (this: IEvent) {
  if (this.status === "scheduled") return true;
  if (this.status === "completed" || this.status === "cancelled") return false;
  return this.date > new Date();
});

// Auto-generate slug from title on save
EventSchema.pre("save", async function (this: IEvent, next) {
  if (this.isModified("title") || !this.slug) {
    let baseSlug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    // Ensure uniqueness by appending a counter if needed
    let slug = baseSlug;
    let counter = 0;
    const EventModel = mongoose.model("Event");
    while (true) {
      const existing = await EventModel.findOne({ slug, _id: { $ne: this._id } });
      if (!existing) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
    this.slug = slug;
  }
  next();
});

export const Event = mongoose.model<IEvent>("Event", EventSchema);

