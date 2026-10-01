import { Router } from "express";
import * as notificationCtrl from "../controllers/notification.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// All notification routes require authentication
router.use(authMiddleware());

// Query notifications and unread count
router.get("/", notificationCtrl.getNotifications);

// Mark read
router.patch("/read-all", notificationCtrl.markAllAsRead);
router.patch("/:id/read", notificationCtrl.markAsRead);

// Dismiss / delete
router.delete("/clear-all", notificationCtrl.clearAll);
router.delete("/:id", notificationCtrl.dismiss);

// Admin / Moderator broadcast announcement
router.post("/broadcast", authMiddleware(["admin", "moderator"]), notificationCtrl.sendBroadcast);
router.get("/broadcasts", authMiddleware(["admin", "moderator"]), notificationCtrl.getBroadcasts);
router.delete("/broadcasts/:id", authMiddleware(["admin"]), notificationCtrl.deleteBroadcast);

export default router;
