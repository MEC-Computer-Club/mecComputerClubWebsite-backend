import mongoose, { Document, Schema } from "mongoose";

export interface IDailyApiAnalytics extends Document {
  date: string; // "YYYY-MM-DD"
  method: string; // "GET", "POST", etc.
  route: string; // e.g. "/api/users/profile/:id"
  totalHits: number;
  callers: Map<string, number>; // e.g. { "/cp-hub": 5120, "/dashboard/members": 2040 }
  statusBuckets: {
    s2xx: number;
    s3xx: number;
    s4xx: number;
    s5xx: number;
  };
  totalLatencyMs: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const dailyApiAnalyticsSchema = new Schema<IDailyApiAnalytics>(
  {
    date: {
      type: String,
      required: true,
      index: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    method: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    route: {
      type: String,
      required: true,
      trim: true,
    },
    totalHits: {
      type: Number,
      default: 0,
    },
    callers: {
      type: Map,
      of: Number,
      default: {},
    },
    statusBuckets: {
      s2xx: { type: Number, default: 0 },
      s3xx: { type: Number, default: 0 },
      s4xx: { type: Number, default: 0 },
      s5xx: { type: Number, default: 0 },
    },
    totalLatencyMs: {
      type: Number,
      default: 0,
    },
    avgLatencyMs: {
      type: Number,
      default: 0,
    },
    maxLatencyMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

dailyApiAnalyticsSchema.index({ date: -1, route: 1, method: 1 }, { unique: true });
dailyApiAnalyticsSchema.index({ date: -1, totalHits: -1 });

export const DailyApiAnalytics = mongoose.model<IDailyApiAnalytics>(
  "DailyApiAnalytics",
  dailyApiAnalyticsSchema
);
export default DailyApiAnalytics;
