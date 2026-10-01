import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as dashboardCtrl from "../controllers/dashboard.controller";

const router = Router();

// -----------------------------------------------------
// 🚀 GET METHODS: API ENDPOINTS FOR GETTING DATA
// -----------------------------------------------------
router.get("/member-stats", authMiddleware(), dashboardCtrl.getMemberDashboard);
router.get("/admin-stats", authMiddleware(["admin", "moderator", "executive", "advisor"]), dashboardCtrl.getAdminDashboard);
router.get("/cloudinary-stats", authMiddleware(["admin", "moderator", "executive", "advisor"]), dashboardCtrl.getCloudinaryStats);
router.get("/visual-overview", authMiddleware(["admin", "moderator", "executive", "advisor"]), dashboardCtrl.getVisualOverview);
router.get("/members", authMiddleware(["admin", "moderator", "executive", "advisor"]), dashboardCtrl.getMembersData);

router.get("/application/:id", authMiddleware(["admin", "moderator", "executive"]), dashboardCtrl.getApplicationDetails);

// -----------------------------------------------------
// 🚀 POST METHODS: API ENDPOINTS FOR CREATES/POST
// -----------------------------------------------------
router.post("/members", authMiddleware(["admin", "moderator", "executive", "advisor"]), dashboardCtrl.getUsersByFiltering);

// -----------------------------------------------------
// 🚀 PATCH METHODS: API ENDPOINTS FOR UPDATES
// -----------------------------------------------------
router.patch(
  "/application-status/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  dashboardCtrl.updateApplicationStatus
);
export default router;
