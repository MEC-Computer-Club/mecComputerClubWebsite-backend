import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { createUploader } from "../config/multer.config";
import * as coverPresetCtrl from "../controllers/coverPreset.controller";

const router = Router();
const uploadPreset = createUploader("cover_presets");

// Public: view all presets
router.get("/", coverPresetCtrl.getCoverPresets);

// Protected: Admin or Moderator upload / delete presets
router.post(
  "/",
  authMiddleware(["admin", "moderator"]),
  uploadPreset.single("image"),
  coverPresetCtrl.createCoverPreset
);

router.delete(
  "/:id",
  authMiddleware(["admin", "moderator"]),
  coverPresetCtrl.deleteCoverPreset
);

export default router;
