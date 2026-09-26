import { Router } from "express";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware";
import {
  createSponsor, getAllSponsors, getSponsorById,
  updateSponsor, addSponsorshipRecord, deleteSponsor,
} from "../controllers/sponsor.controller";
import { createUploader } from "../config/multer.config";

const router = Router();
const upload = createUploader("sponsors");

router.get("/", optionalAuthMiddleware, getAllSponsors);
router.get("/:id", optionalAuthMiddleware, getSponsorById);
router.post("/", authMiddleware(["admin", "moderator"]), upload.single("logo"), createSponsor);
router.patch("/:id", authMiddleware(["admin", "moderator"]), upload.single("logo"), updateSponsor);
router.post("/:id/sponsorships", authMiddleware(["admin", "moderator"]), addSponsorshipRecord);
router.delete("/:id", authMiddleware(["admin", "moderator"]), deleteSponsor);

export default router;
