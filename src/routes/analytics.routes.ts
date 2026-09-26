import { Router } from "express";
import { trackUsage, getAnalyticsOverview } from "../controllers/analytics.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public / Authenticated: track utility usage
router.post("/track", optionalAuthMiddleware, trackUsage);

// Admin: Analytics overview
router.get("/overview", authMiddleware(["admin", "moderator", "executive"]), getAnalyticsOverview);

export default router;
