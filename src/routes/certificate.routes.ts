import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  verifyCertificate,
  getUserCertificates,
  getMyCertificates,
  getEventCertificates,
  createCertificate,
  bulkIssueCertificates,
  revokeCertificate,
  deleteCertificate,
  listCertificates,
  updateCertificate,
} from "../controllers/certificate.controller";

const router = Router();

// Private: get currently authenticated user's certificates
router.get("/my-certificates", authMiddleware(), getMyCertificates);

// Public: verify a certificate by unique certificate ID
router.get("/verify/:certificateId", verifyCertificate);

// Public: get all certificates for a user
router.get("/user/:userId", getUserCertificates);

// Public/Admin: get all certificates for an event
router.get("/event/:eventId", getEventCertificates);

// Admin/Executive/Advisor: list all certificates (with search & filters)
router.get("/", authMiddleware(["admin", "moderator", "executive", "advisor"]), listCertificates);

// Admin/Executive: create an individual certificate
router.post("/", authMiddleware(["admin", "moderator", "executive"]), createCertificate);

// Admin/Executive: bulk issue certificates (for 100+ event attendees or list of student IDs)
router.post("/bulk", authMiddleware(["admin", "moderator", "executive"]), bulkIssueCertificates);

// Admin/Executive: update a certificate details / recipient metadata
router.patch("/:id", authMiddleware(["admin", "moderator", "executive"]), updateCertificate);

// Admin/Executive: revoke a certificate
router.patch("/:id/revoke", authMiddleware(["admin", "moderator", "executive"]), revokeCertificate);

// Admin/Executive: delete a certificate permanently
router.delete("/:id", authMiddleware(["admin", "moderator", "executive"]), deleteCertificate);

export default router;
