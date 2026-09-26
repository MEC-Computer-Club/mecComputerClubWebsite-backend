import mongoose from "mongoose";
import "./env";

const getMongoUri = () => process.env.MONGO_URI || "mongodb://localhost:27017/mec_computer_club";

let cachedConnection: typeof mongoose | null = null;
let migrationRan = false;

const runSchemaCleanupMigration = async () => {
  if (migrationRan) return;
  migrationRan = true;
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const usersCollection = db.collection("users");

    // Check if any legacy fields still exist in the database
    const legacyExists = await usersCollection.findOne(
      {
        $or: [
          { failedLoginAttempts: { $exists: true } },
          { lockUntil: { $exists: true } },
          { loginSecurityCode: { $exists: true } },
          { isApproved: { $exists: true } },
          { activitiesId: { $exists: true } },
          { professionalCareerId: { $exists: true } },
          { "activeSession.deviceId": { $exists: true } },
        ],
      },
      { projection: { _id: 1 } }
    );

    if (legacyExists) {
      const result = await usersCollection.updateMany(
        {
          $or: [
            { failedLoginAttempts: { $exists: true } },
            { lockUntil: { $exists: true } },
            { loginSecurityCode: { $exists: true } },
            { isApproved: { $exists: true } },
            { activitiesId: { $exists: true } },
            { professionalCareerId: { $exists: true } },
            { "activeSession.deviceId": { $exists: true } },
          ],
        },
        [
          {
            $set: {
              security: {
                failedAttempts: { $ifNull: ["$security.failedAttempts", { $ifNull: ["$failedLoginAttempts", 0] }] },
                lockUntil: { $ifNull: ["$security.lockUntil", "$lockUntil"] },
                loginCode: { $ifNull: ["$security.loginCode", "$loginSecurityCode"] },
                loginCodeExpiry: { $ifNull: ["$security.loginCodeExpiry", "$loginSecurityCodeExpiry"] },
                codeSentAt: { $ifNull: ["$security.codeSentAt", "$securityCodeSentAt"] },
                activeSession: {
                  $ifNull: [
                    "$security.activeSession",
                    {
                      deviceId: { $ifNull: ["$activeSession.deviceId", ""] },
                      deviceSignature: { $ifNull: ["$activeSession.deviceSignature", ""] },
                      ip: { $ifNull: ["$activeSession.ip", ""] },
                      userAgent: { $ifNull: ["$activeSession.userAgent", ""] },
                      lastActiveAt: "$activeSession.lastActiveAt",
                      isOnline: { $ifNull: ["$activeSession.isOnline", false] },
                    },
                  ],
                },
                blockedDevices: { $ifNull: ["$security.blockedDevices", { $ifNull: ["$blockedDevices", []] }] },
              },
            },
          },
          {
            $unset: [
              "failedLoginAttempts",
              "lockUntil",
              "loginSecurityCode",
              "loginSecurityCodeExpiry",
              "securityCodeSentAt",
              "activeSession",
              "blockedDevices",
              "isApproved",
              "activitiesId",
              "professionalCareerId",
            ],
          },
        ]
      );
      if (result.modifiedCount > 0) {
        console.log(`[Schema Migration] Successfully migrated ${result.modifiedCount} user(s) to nested security subdocument & removed legacy dead fields.`);
      }
    }
  } catch (migErr) {
    console.warn("[Schema Migration] Notice:", migErr);
  }
};

export const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    runSchemaCleanupMigration().catch(() => {});
    return mongoose;
  }
  if (cachedConnection) {
    runSchemaCleanupMigration().catch(() => {});
    return cachedConnection;
  }
  try {
    cachedConnection = await mongoose.connect(getMongoUri());
    console.log("Mongo connected");
    runSchemaCleanupMigration().catch(() => {});
    return cachedConnection;
  } catch (err) {
    console.error("Mongo connection failed:", err);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
    throw err;
  }
};
