import express from "express";
import {
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
} from "../controllers/asset.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

// Allow authenticated users / staff to view assets
router.get(
  "/",
  authMiddleware(["admin", "moderator", "executive", "advisor", "member"]),
  getAssets
);

// Management routes (admin, moderator, executive)
router.post(
  "/",
  authMiddleware(["admin", "moderator", "executive"]),
  createAsset
);

router.put(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  updateAsset
);

router.delete(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  deleteAsset
);

export default router;
