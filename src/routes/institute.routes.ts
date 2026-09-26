import { Router } from "express";
import {
  searchInstitutes,
  getAllInstitutes,
  createInstitute,
} from "../controllers/institute.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public: Debounced search for auto-suggest
router.get("/search", searchInstitutes);

// Admin: Management and list
router.get("/", authMiddleware(["admin", "moderator", "executive"]), getAllInstitutes);
router.post("/", authMiddleware(["admin", "moderator", "executive"]), createInstitute);

export default router;
