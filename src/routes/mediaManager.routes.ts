import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { createFileUploader } from "../config/multer.config";
import * as mediaCtrl from "../controllers/mediaManager.controller";

const router = Router();
const upload = createFileUploader("misc");

// Storage stats (usage, bandwidth, credits, objects)
router.get("/stats", authMiddleware(["admin", "moderator", "advisor"]), mediaCtrl.getMediaStats);

// List Cloudinary folders
router.get("/folders", authMiddleware(["admin", "moderator", "advisor"]), mediaCtrl.getMediaFolders);

// Search & list Cloudinary media resources
router.get("/resources", authMiddleware(["admin", "moderator", "advisor"]), mediaCtrl.getMediaResources);

// Upload new media into a folder
router.post(
  "/upload",
  authMiddleware(["admin", "moderator", "advisor", "executive"]),
  upload.single("file"),
  mediaCtrl.uploadMedia
);

// Create new folder
router.post("/folders", authMiddleware(["admin", "moderator", "advisor", "executive"]), mediaCtrl.createFolder);

// Move to trash or permanently delete
router.delete("/resource", authMiddleware(["admin", "moderator", "advisor", "executive"]), mediaCtrl.deleteMedia);

// Restore media asset from trash
router.post("/restore", authMiddleware(["admin", "moderator", "advisor", "executive"]), mediaCtrl.restoreMedia);

export default router;
