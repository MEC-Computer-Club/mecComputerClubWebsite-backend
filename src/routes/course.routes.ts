import { Router } from "express";
import {
  searchCourses,
  getCoursesBySemester,
  getAvailableSessions,
  submitCourse,
  getAllCourses,
  updateCourseStatus,
  updateCourse,
  deleteCourse,
  deltaShuffleCourse,
  deltaReplaceCourse,
  deltaReduceCourse,
  deltaRevertCourse,
} from "../controllers/course.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// Public search for auto-suggest
router.get("/search", searchCourses);

// Public distinct sessions list (only sessions where changes/courses exist)
router.get("/sessions", getAvailableSessions);

// Public query for semester-wise courses for CGPA calculator
router.get("/semester", getCoursesBySemester);

// User submission from cover-page generator (optional auth)
router.post("/submit", optionalAuthMiddleware, submitCourse);

// Syllabus Evolution Delta Management (Shuffle, Replace, Reduce, Revert)
router.post("/delta/shuffle", authMiddleware(["admin", "moderator", "executive"]), deltaShuffleCourse);
router.post("/delta/replace", authMiddleware(["admin", "moderator", "executive"]), deltaReplaceCourse);
router.post("/delta/reduce", authMiddleware(["admin", "moderator", "executive"]), deltaReduceCourse);
router.post("/delta/revert", authMiddleware(["admin", "moderator", "executive"]), deltaRevertCourse);

// Admin / Moderator / Executive management
router.get("/", authMiddleware(["admin", "moderator", "executive"]), getAllCourses);
router.patch("/:id/status", authMiddleware(["admin", "moderator", "executive"]), updateCourseStatus);
router.patch("/:id", authMiddleware(["admin", "moderator", "executive"]), updateCourse);
router.delete("/:id", authMiddleware(["admin", "moderator", "executive"]), deleteCourse);

export default router;
