import { Router } from "express";
import {
  createInvitationCode,
  verifyInvitationCode,
  consumeInvitationCode,
  cancelInvitationCode,
  updateInvitationStatus,
  getCodeInfo,
  getAllInvitationCodes,
  deleteInvitationCode,
  resendInvitationCode,
} from "../controllers/invitationCode.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Client (Public)
router.get("/", getCodeInfo);
router.post("/verify", verifyInvitationCode);
router.post("/consume", consumeInvitationCode);

// Admin, Moderator & Executive (Protected)
router.get("/list", authMiddleware(["admin", "moderator", "executive"]), getAllInvitationCodes);
router.get("/all", authMiddleware(["admin", "moderator", "executive"]), getAllInvitationCodes);
router.post("/create", authMiddleware(["admin", "moderator", "executive"]), createInvitationCode);
router.patch("/status", authMiddleware(["admin", "moderator", "executive"]), updateInvitationStatus);
router.post("/status", authMiddleware(["admin", "moderator", "executive"]), updateInvitationStatus);
router.post("/cancel", authMiddleware(["admin", "moderator", "executive"]), cancelInvitationCode);
router.post("/resend", authMiddleware(["admin", "moderator", "executive"]), resendInvitationCode);
router.delete("/:id", authMiddleware(["admin"]), deleteInvitationCode);
router.delete("/", authMiddleware(["admin"]), deleteInvitationCode);

export default router;
