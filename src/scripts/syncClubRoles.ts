import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User, { deriveClubRole } from "../models/User.model";

async function syncClubRoles() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("No MongoDB URI found in environment.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB for clubRole auto-sync.");

  const allUsers = await User.find({}).select(
    "_id fullName role clubRole designation customRole isGraduated session"
  );
  console.log(`Found ${allUsers.length} total users.`);

  let updatedCount = 0;
  const counts: Record<string, number> = {
    advisor: 0,
    alumni: 0,
    executive: 0,
    member: 0,
  };

  for (const u of allUsers) {
    const targetClubRole = deriveClubRole(u);
    counts[targetClubRole] = (counts[targetClubRole] || 0) + 1;

    if (u.clubRole !== targetClubRole) {
      await User.updateOne({ _id: u._id }, { $set: { clubRole: targetClubRole } });
      updatedCount++;
    }
  }

  console.log(`Sync complete. Updated ${updatedCount} users.`);
  console.log("Current Club Role Breakdown:", counts);

  await mongoose.disconnect();
}

syncClubRoles().catch((err) => {
  console.error("Sync error:", err);
  process.exit(1);
});
