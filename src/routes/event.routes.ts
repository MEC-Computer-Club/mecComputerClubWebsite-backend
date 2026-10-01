import { Router } from "express";
import {
  handleCreateEvent, handleGetEvents, handleGetEventById,
  handleUpdateEvent, handleDeleteEvent,
  // Participants
  registerParticipant, approveParticipant, rejectParticipant,
  addAttendee, removeAttendee,
  // Winners
  setWinners,
  // Contributors (Organizers & Volunteers)
  setContributors,
  // Sponsors
  addEventSponsor, removeEventSponsor,
  // Media
  uploadEventMedia, removeEventMedia, getGalleryMedia,
  // Certificates
  issueCertificates, getEventCertificates,
  getMyEvents,
  // Participation Claims
  claimParticipation, getMyParticipationClaim,
  approveParticipationClaim, rejectParticipationClaim,
  // Form Submissions & Broadcasts
  getEventFormSubmissions, bulkApproveFormSubmissions,
  bulkRejectFormSubmissions, sendEventBroadcast,
} from "../controllers/event.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import { createUploader } from "../config/multer.config";

const router = Router();
const upload = createUploader("event_media");

// ── Basic CRUD ──────────────────────────────────────────────────────────────
router.get("/my-events", authMiddleware(), getMyEvents);
router.post("/", authMiddleware(["admin", "moderator"]), handleCreateEvent);
router.get("/", handleGetEvents);
router.get("/media/gallery", getGalleryMedia);
router.get("/:id", handleGetEventById);
router.patch("/:id", authMiddleware(["admin", "moderator"]), handleUpdateEvent);
router.delete("/:id", authMiddleware(["admin", "moderator"]), handleDeleteEvent);

// ── Participation Claims (Archived / Past Events) ───────────────────────────
router.post("/:id/claim-participation", optionalAuthMiddleware, claimParticipation);
router.get("/:id/my-claim", optionalAuthMiddleware, getMyParticipationClaim);
router.patch("/:id/claims/:claimId/approve", authMiddleware(["admin", "moderator"]), approveParticipationClaim);
router.patch("/:id/claims/:claimId/reject", authMiddleware(["admin", "moderator"]), rejectParticipationClaim);

// ── Participants ────────────────────────────────────────────────────────────
router.post("/:id/participants/register", authMiddleware(), registerParticipant);
router.post("/:id/participants/add", authMiddleware(["admin", "moderator"]), addAttendee);
router.patch("/:id/participants/:userId/approve", authMiddleware(["admin", "moderator"]), approveParticipant);
router.patch("/:id/participants/:userId/reject", authMiddleware(["admin", "moderator"]), rejectParticipant);
router.delete("/:id/participants/:userId", authMiddleware(["admin", "moderator"]), removeAttendee);

// ── Winners ─────────────────────────────────────────────────────────────────
router.put("/:id/winners", authMiddleware(["admin", "moderator"]), setWinners);

// ── Contributors (Organizers & Volunteers) ───────────────────────────────────
router.put("/:id/contributors", authMiddleware(["admin", "moderator"]), setContributors);

// ── Sponsors ────────────────────────────────────────────────────────────────
router.post("/:id/sponsors", authMiddleware(["admin", "moderator"]), addEventSponsor);
router.delete("/:id/sponsors/:sponsorId", authMiddleware(["admin", "moderator"]), removeEventSponsor);

// ── Media ───────────────────────────────────────────────────────────────────
router.post("/:id/media", authMiddleware(["admin", "moderator"]), upload.single("file"), uploadEventMedia);
router.delete("/:id/media/:mediaId", authMiddleware(["admin", "moderator"]), removeEventMedia);

// ── Certificates ────────────────────────────────────────────────────────────
router.post("/:id/certificates", authMiddleware(["admin", "moderator"]), issueCertificates);
router.get("/:id/certificates", authMiddleware(["admin", "moderator"]), getEventCertificates);

// ── Linked Form Submissions & Bulk Approvals ────────────────────────────────
router.get("/:id/form-submissions", authMiddleware(["admin", "moderator"]), getEventFormSubmissions);
router.post("/:id/form-submissions/bulk-approve", authMiddleware(["admin", "moderator"]), bulkApproveFormSubmissions);
router.post("/:id/form-submissions/bulk-reject", authMiddleware(["admin", "moderator"]), bulkRejectFormSubmissions);

// ── Mailing & Broadcasts ───────────────────────────────────────────────────
router.post("/:id/broadcast", authMiddleware(["admin", "moderator"]), sendEventBroadcast);

export default router;
