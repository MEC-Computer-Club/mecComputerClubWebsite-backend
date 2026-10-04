import "../config/env";
import { connectDB } from "../config/db.config";
import DailyWebAnalytics from "../models/DailyWebAnalytics.model";
import DailyApiAnalytics from "../models/DailyApiAnalytics.model";
import mongoose from "mongoose";

async function main() {
  await connectDB();
  console.log("Connected to MongoDB. Clearing Site & API Analytics...");

  const webResult = await DailyWebAnalytics.deleteMany({});
  console.log(`Deleted ${webResult.deletedCount} DailyWebAnalytics documents.`);

  const apiResult = await DailyApiAnalytics.deleteMany({});
  console.log(`Deleted ${apiResult.deletedCount} DailyApiAnalytics documents.`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB. Site analytics numbers are completely cleared!");
}

main().catch((err) => {
  console.error("Error clearing analytics:", err);
  process.exit(1);
});
