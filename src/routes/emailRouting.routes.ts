import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  getEmailRouting,
  updateEmailRouting,
  getStaffUsers,
} from "../controllers/emailRouting.controller";

const router = Router();

router.get("/", authMiddleware(["admin", "moderator"]), getEmailRouting);
router.put("/", authMiddleware(["admin"]), updateEmailRouting);
router.get("/staff-users", authMiddleware(["admin", "moderator"]), getStaffUsers);

export default router;
