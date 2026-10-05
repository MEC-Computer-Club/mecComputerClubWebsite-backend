import { Router } from "express";
import {
  getDevelopers,
  createDeveloper,
  updateDeveloper,
  deleteDeveloper,
  reorderDevelopers,
} from "../controllers/developer.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public: Get all active platform contributors
router.get("/", getDevelopers);

// Admin/Moderator Only: Create contributor
router.post("/", authMiddleware(["admin", "moderator"]), createDeveloper);

// Admin/Moderator Only: Update contributor
router.put("/:id", authMiddleware(["admin", "moderator"]), updateDeveloper);

// Admin/Moderator Only: Delete contributor
router.delete("/:id", authMiddleware(["admin", "moderator"]), deleteDeveloper);

// Admin/Moderator Only: Reorder contributors
router.put("/reorder", authMiddleware(["admin", "moderator"]), reorderDevelopers);

export default router;
