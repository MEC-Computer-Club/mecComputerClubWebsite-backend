import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  getSiteSettings,
  getPublicBatchSettings,
  updateSiteSettings,
  upsertSiteSetting,
  updateClubRoomStatus,
} from "../controllers/siteSetting.controller";

const router = Router();

// Public: get only batch settings & club room status (no auth required)
router.get("/public", getPublicBatchSettings);

// Admin & Executive: update club room status
router.patch("/club-room", authMiddleware(["admin", "moderator", "executive"]), updateClubRoomStatus);

// Admin: get all settings
router.get("/", authMiddleware(["admin", "moderator"]), getSiteSettings);

// Admin: bulk update settings
router.put("/", authMiddleware(["admin"]), updateSiteSettings);

// Admin: upsert a single setting
router.post("/", authMiddleware(["admin"]), upsertSiteSetting);

export default router;
