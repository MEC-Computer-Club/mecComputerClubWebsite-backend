import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { createFileUploader } from "../config/multer.config";
import * as mediaCtrl from "../controllers/mediaManager.controller";

const router = Router();
const upload = createFileUploader("misc");

// Storage stats (usage, bandwidth, credits, objects)
router.get("/stats", authMiddleware(["admin"]), mediaCtrl.getMediaStats);

// List Cloudinary folders
router.get("/folders", authMiddleware(["admin"]), mediaCtrl.getMediaFolders);

// Search & list Cloudinary media resources
router.get("/resources", authMiddleware(["admin"]), mediaCtrl.getMediaResources);

// Upload new media into a folder
router.post(
  "/upload",
  authMiddleware(["admin"]),
  upload.single("file"),
  mediaCtrl.uploadMedia
);

// Create new folder
router.post("/folders", authMiddleware(["admin"]), mediaCtrl.createFolder);

// Move to trash or permanently delete
router.delete("/resource", authMiddleware(["admin"]), mediaCtrl.deleteMedia);

// Restore media asset from trash
router.post("/restore", authMiddleware(["admin"]), mediaCtrl.restoreMedia);

export default router;
