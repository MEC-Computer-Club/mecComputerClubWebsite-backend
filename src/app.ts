import "./config/env";
import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import userRoutes from "./routes/user.routes";
import uploadRoutes from "./routes/upload.routes";
import inviteRoutes from "./routes/invite.routes";
import eventRoutes from "./routes/event.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import formRoutes from "./routes/form.routes";
import pageRoutes from "./routes/page.routes";
import contactMessageRoutes from "./routes/contactMessage.routes";
import siteSettingRoutes from "./routes/siteSetting.routes";
import certificateRoutes from "./routes/certificate.routes";
import blogRoutes from "./routes/blog.routes";
import sponsorRoutes from "./routes/sponsor.routes";
import projectRoutes from "./routes/project.routes";
import customPageRoutes from "./routes/customPage.routes";
import designationRoutes from "./routes/designation.routes";
import pageContentRoutes from "./routes/pageContent.routes";
import courseRoutes from "./routes/course.routes";
import instructorRoutes from "./routes/instructor.routes";
import questionArchiveRoutes from "./routes/questionArchive.routes";
import coverPresetRoutes from "./routes/coverPreset.routes";

import certificateTemplateRoutes from "./routes/certificateTemplate.routes";
import notificationRoutes from "./routes/notification.routes";
import emailRoutingRoutes from "./routes/emailRouting.routes";
import emailTemplateRoutes from "./routes/emailTemplate.routes";
import instituteRoutes from "./routes/institute.routes";
import analyticsRoutes from "./routes/analytics.routes";
import committeeRoutes from "./routes/committee.routes";
import auditLogRoutes from "./routes/auditLog.routes";
import { getGalleryMedia } from "./controllers/event.controller";

// Ensure all models are registered with Mongoose before any route handler runs
import "./models/Committee.model";
import "./models/CoverPreset.model";
import "./models/Notification.model";
import "./models/Media.model";
import "./models/CertificateTemplate.model";
import "./models/Certificate.model";
import "./models/Sponsor.model";
import "./models/Project.model";
import "./models/Blog.model";
import "./models/Course.model";
import "./models/Instructor.model";
import "./models/Institute.model";
import "./models/ToolUsage.model";
import "./models/QuestionArchive.model";
import "./models/DailyWebAnalytics.model";
import "./models/DailyApiAnalytics.model";
import apiAnalyticsMiddleware from "./middlewares/apiAnalytics.middleware";
import cors, { CorsOptions } from "cors";
import globalErrorHandler from "./middlewares/errorMiddleware";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.config";
import path from "path";

const app = express();
app.use("/public", express.static(path.join(__dirname, "..", "public")));
const frontendUrl = process.env.FRONTEND_URL;

const allowedOrigins = [
  "https://mec-cc.vercel.app",
  "https://mec-cc-frontend.vercel.app",
  "https://meccomputerclub.vercel.app",
  "https://www.meccomputerclub.org",
  "https://meccomputerclub.org",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  frontendUrl,
].filter(Boolean) as string[];

const corsOptions: CorsOptions = {
  origin: (requestOrigin: string | undefined, callback: any) => {
    if (!requestOrigin) return callback(null, true);
    const originLower = requestOrigin.replace(/\/+$/, "").toLowerCase();
    if (
      allowedOrigins.some((o) => o.replace(/\/+$/, "").toLowerCase() === originLower) ||
      originLower.endsWith(".vercel.app") ||
      originLower.includes("mec-cc") ||
      originLower.includes("meccomputerclub") ||
      /\.vercel\.app$/.test(originLower) ||
      /\.meccomputerclub\.org$/.test(originLower)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS policy for origin: ${requestOrigin}`));
    }
  },
  credentials: true,
  methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-invitation-validated",
    "x-invite-code",
    "X-Invitation-Validated",
    "X-Invite-Code",
    "X-Requested-With",
    "x-device-id",
    "X-Device-Id",
    "x-caller-page",
    "X-Caller-Page",
    "x-session-id",
    "X-Session-Id",
    "Accept",
    "Origin",
  ],
  exposedHeaders: [
    "Retry-After",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
  ],
};

app.use(cors(corsOptions));
app.use(compression());

// parse before routes
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(apiAnalyticsMiddleware);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// serve uploads folder publicly
app.use("/uploads", express.static("uploads"));

// routes
app.use("/api/upload", uploadRoutes);
app.use("/upload", uploadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/invite", inviteRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/events", eventRoutes);
app.get("/api/gallery", getGalleryMedia);
app.use("/api/page", pageRoutes);
app.use("/api/contact-messages", contactMessageRoutes);
app.use("/api/site-settings", siteSettingRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/certificate-templates", certificateTemplateRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/sponsors", sponsorRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/custom-pages", customPageRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/designations", designationRoutes);
app.use("/api/committees", committeeRoutes);
app.use("/api/page-content", pageContentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/instructors", instructorRoutes);
app.use("/api/questions", questionArchiveRoutes);
app.use("/api/email-routing", emailRoutingRoutes);
app.use("/api/email-templates", emailTemplateRoutes);
app.use("/api/institutes", instituteRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/cover-presets", coverPresetRoutes);

// Local development: Media Manager
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const localMediaRoutes = require("./routes/mediaManager.routes");
  const mediaManagerRouter = localMediaRoutes.default || localMediaRoutes;
  if (mediaManagerRouter) {
    app.use("/api/media-manager", mediaManagerRouter);
  }
} catch {
  // Kept in local environment only
}

app.get("/", (req, res) => {
  res.send("Welcome to the API! Visit /api/docs for documentation.");
});
app.get("/health", (req, res) => res.json({ ok: true }));
app.use(globalErrorHandler);

// health

export default app;
