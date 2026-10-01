import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createCustomPage, getAllCustomPages, getCustomPageBySlug,
  getCustomPageById, updateCustomPage, deleteCustomPage,
} from "../controllers/customPage.controller";

const router = Router();

// Public: get published page by slug (for frontend rendering)
router.get("/slug/:slug", getCustomPageBySlug);

// Admin: full CRUD
router.get("/", authMiddleware(["admin", "moderator"]), getAllCustomPages);
router.get("/:id", authMiddleware(["admin", "moderator"]), getCustomPageById);
router.post("/", authMiddleware(["admin", "moderator"]), createCustomPage);
router.patch("/:id", authMiddleware(["admin", "moderator"]), updateCustomPage);
router.delete("/:id", authMiddleware(["admin"]), deleteCustomPage);

export default router;
