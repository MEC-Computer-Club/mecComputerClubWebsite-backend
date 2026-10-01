import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User.model";

async function migrateAdvisors() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("No MongoDB URI found in environment.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB for advisor role migration.");

  const result = await User.updateMany(
    { clubRole: "advisor", role: { $ne: "advisor" } },
    { $set: { role: "advisor" } }
  );

  console.log(`Updated ${result.modifiedCount} advisor users to role: "advisor".`);
  await mongoose.disconnect();
  console.log("Migration complete.");
}

migrateAdvisors().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
