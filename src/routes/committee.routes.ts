import express from "express";
import * as committeeCtrl from "../controllers/committee.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

// Public routes for visitors to browse committee terms and archive
router.get("/", committeeCtrl.getCommittees);
router.get("/current", committeeCtrl.getCommitteeByTerm);
router.get("/term/:term", committeeCtrl.getCommitteeByTerm);

// Administrative / Executive management routes
router.post(
  "/",
  authMiddleware(["admin", "moderator", "executive"]),
  committeeCtrl.createCommittee
);

router.put(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  committeeCtrl.updateCommittee
);

router.delete(
  "/:id",
  authMiddleware(["admin", "moderator", "executive"]),
  committeeCtrl.deleteCommittee
);

export default router;
