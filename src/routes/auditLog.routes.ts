import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getAuditLogs, createAuditLogEntry } from "../controllers/auditLog.controller";

const router = Router();

// Only admin & moderator can read / write platform audit logs
router.get("/", authMiddleware(["admin", "moderator"]), getAuditLogs);
router.post("/", authMiddleware(["admin", "moderator"]), createAuditLogEntry);

export default router;
