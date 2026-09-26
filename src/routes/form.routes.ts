import { Router } from "express";
import {
  createForm,
  getFormsByEvent,
  getFormById,
  disableForm,
  getAllForms,
  deleteForm,
  updateForm,
} from "../controllers/form.controller";

import {
  submitForm,
  getSubmissionsByForm,
  exportSubmissions,
  deleteSubmission,
  updateSubmission,
} from "../controllers/formSubmission.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

import "../docs/form.docs"; // 🔥 IMPORTANT: load swagger docs

const router = Router();

// Create form (Admin)
router.post("/", authMiddleware(["admin", "moderator", "executive"]), createForm);

// Get all forms (Admin)
router.get("/", getAllForms);

// Get all forms by event
router.get("/event/:eventId", getFormsByEvent);

// Export submissions directly (Admin)
router.get("/export/:formId", authMiddleware(["admin", "moderator", "executive"]), exportSubmissions);

// Delete single submission (Admin)
router.delete("/submissions/:submissionId", authMiddleware(["admin", "moderator", "executive"]), deleteSubmission);

// Update/modify single submission (Admin)
router.put("/submissions/:submissionId", authMiddleware(["admin", "moderator", "executive"]), updateSubmission);

// Get single form
router.get("/:id", getFormById);

// Disable form (Admin)
router.patch("/disable/:id", authMiddleware(["admin", "moderator", "executive"]), disableForm);

// Delete form (Admin)
router.delete("/:id", authMiddleware(["admin", "moderator", "executive"]), deleteForm);

// Submit form
router.post("/submit/:formId", submitForm);

// Get submissions of a form (Admin)
router.get("/submissions/:formId", getSubmissionsByForm);

// Update form (Admin)
router.put("/:id", authMiddleware(["admin", "moderator", "executive"]), updateForm);

export default router;
