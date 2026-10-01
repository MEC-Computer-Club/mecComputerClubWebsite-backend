import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  createBlog,
  getAllBlogs,
  getBlogById,
  getBlogBySlug,
  getMyBlogs,
  updateBlog,
  deleteBlog,
  toggleBlogLike,
  toggleFeaturedBlog,
  incrementBlogView,
} from "../controllers/blog.controller";

const router = Router();

router.get("/", getAllBlogs);
router.get("/my", authMiddleware(), getMyBlogs);
router.get("/slug/:slug", getBlogBySlug);
router.get("/:id", getBlogById);
router.post("/slug/:slug/view", incrementBlogView);
router.post("/:id/view", incrementBlogView);
router.post("/:id/like", authMiddleware(), toggleBlogLike);
router.post("/", authMiddleware(["admin", "moderator", "member", "executive", "alumni", "advisor"]), createBlog);
router.patch("/:id/featured", authMiddleware(["admin", "moderator"]), toggleFeaturedBlog);
router.patch("/:id", authMiddleware(), updateBlog);
router.delete("/:id", authMiddleware(), deleteBlog);

export default router;
