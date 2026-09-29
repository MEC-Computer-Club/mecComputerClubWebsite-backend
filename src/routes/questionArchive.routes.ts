import { Router } from "express";
import {
  getQuestions,
  getQuestionFilters,
  getQuestionById,
  downloadQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} from "../controllers/questionArchive.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { createQuestionFileUploader } from "../config/multer.config";

const router = Router();
const questionFileUpload = createQuestionFileUploader("questions");

const fileMiddleware = (req: any, res: any, next: any) => {
  questionFileUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])(req, res, (err: any) => {
    if (err) return next(err);
    if (req.files) {
      req.file =
        req.files["file"]?.[0] ||
        req.files["pdf"]?.[0] ||
        req.files["image"]?.[0] ||
        null;
    }
    next();
  });
};

// Public routes for visitors
router.get("/filters", getQuestionFilters);
router.get("/", getQuestions);
router.get("/:id", getQuestionById);
router.post("/:id/download", downloadQuestion);

// Admin / Moderator routes
router.post(
  "/",
  authMiddleware(["admin", "moderator", "executive"]),
  fileMiddleware,
  createQuestion
);

router.patch(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  fileMiddleware,
  updateQuestion
);

router.put(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  fileMiddleware,
  updateQuestion
);

router.delete(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  deleteQuestion
);

export default router;
