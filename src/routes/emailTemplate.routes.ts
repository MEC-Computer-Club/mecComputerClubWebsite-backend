import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as emailTemplateCtrl from "../controllers/emailTemplate.controller";

const router = Router();

// Only administrators & moderators can view and manage email templates
router.get("/", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.getAllTemplates);
router.get("/branding/settings", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.getBrandingSettings);
router.put("/branding/settings", authMiddleware(["admin"]), emailTemplateCtrl.updateBrandingSettings);
router.get("/:key", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.getTemplateByKey);
router.post("/", authMiddleware(["admin"]), emailTemplateCtrl.createCustomTemplate);
router.put("/:key", authMiddleware(["admin"]), emailTemplateCtrl.updateTemplate);
router.delete("/:key", authMiddleware(["admin"]), emailTemplateCtrl.deleteCustomTemplate);
router.post("/:key/reset", authMiddleware(["admin"]), emailTemplateCtrl.resetTemplate);
router.post("/test-send", authMiddleware(["admin", "moderator"]), emailTemplateCtrl.sendTestEmail);

export default router;
