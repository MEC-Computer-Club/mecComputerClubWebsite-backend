import { Router } from "express";
import {
  trackUsage,
  getAnalyticsOverview,
  collectPageView,
  collectDuration,
  getSiteAnalyticsDashboard,
} from "../controllers/analytics.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public / Authenticated: track utility usage
router.post("/track", optionalAuthMiddleware, trackUsage);

// Public telemetry ingest
router.post("/collect-view", collectPageView);
router.post("/collect-duration", collectDuration);

// Admin & Executive: Site & API Analytics overview
router.get(
  "/site-overview",
  authMiddleware(["admin", "moderator", "executive", "lead"]),
  getSiteAnalyticsDashboard
);

// Admin: Tool Analytics overview
router.get("/overview", authMiddleware(["admin", "moderator", "executive"]), getAnalyticsOverview);

export default router;

