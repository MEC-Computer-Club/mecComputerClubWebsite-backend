import mongoose, { Document, Schema } from "mongoose";

export interface IPageStat {
  path: string;
  views: number;
  totalSecondsSpent: number;
  entryCount: number;
  exitCount: number;
}

export interface IDailyWebAnalytics extends Document {
  date: string; // "YYYY-MM-DD"
  totalPageViews: number;
  uniqueVisitorHashes: string[];
  uniqueVisitorsCount: number;
  sessionsCount: number;
  singlePageSessions: number;
  pages: IPageStat[];
  devices: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  browsers: Map<string, number>;
  os: Map<string, number>;
  referrers: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const pageStatSchema = new Schema<IPageStat>(
  {
    path: { type: String, required: true },
    views: { type: Number, default: 0 },
    totalSecondsSpent: { type: Number, default: 0 },
    entryCount: { type: Number, default: 0 },
    exitCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const dailyWebAnalyticsSchema = new Schema<IDailyWebAnalytics>(
  {
    date: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    totalPageViews: { type: Number, default: 0 },
    uniqueVisitorHashes: { type: [String], default: [] },
    uniqueVisitorsCount: { type: Number, default: 0 },
    sessionsCount: { type: Number, default: 0 },
    singlePageSessions: { type: Number, default: 0 },
    pages: { type: [pageStatSchema], default: [] },
    devices: {
      desktop: { type: Number, default: 0 },
      mobile: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
    },
    browsers: {
      type: Map,
      of: Number,
      default: {},
    },
    os: {
      type: Map,
      of: Number,
      default: {},
    },
    referrers: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

dailyWebAnalyticsSchema.index({ date: -1 });

export const DailyWebAnalytics = mongoose.model<IDailyWebAnalytics>(
  "DailyWebAnalytics",
  dailyWebAnalyticsSchema
);
export default DailyWebAnalytics;
