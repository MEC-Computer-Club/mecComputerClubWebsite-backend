import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as emailTemplateCtrl from "../controllers/emailTemplate.controller";

const router = Router();

// Only administrators & moderators can view and manage email templates
router.get("/", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.getAllTemplates);
router.get("/:key", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.getTemplateByKey);
router.put("/:key", authMiddleware(["admin"]), emailTemplateCtrl.updateTemplate);
router.post("/:key/reset", authMiddleware(["admin"]), emailTemplateCtrl.resetTemplate);
router.post("/test-send", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.sendTestEmail);

export default router;
