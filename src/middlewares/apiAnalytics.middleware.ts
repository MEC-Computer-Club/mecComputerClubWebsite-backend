import { Request, Response, NextFunction } from "express";
import siteAnalyticsService from "../services/siteAnalytics.service";

export const apiAnalyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Ignore preflight OPTIONS, static asset files, and health checks
  if (req.method === "OPTIONS") return next();
  const rawPath = req.path || "";
  if (
    rawPath.startsWith("/uploads") ||
    rawPath.startsWith("/public") ||
    rawPath.startsWith("/api/docs") ||
    rawPath === "/health" ||
    rawPath === "/favicon.ico"
  ) {
    return next();
  }

  const startHrTime = process.hrtime();

  res.on("finish", () => {
    try {
      const diff = process.hrtime(startHrTime);
      const latencyMs = Math.round(diff[0] * 1000 + diff[1] / 1e6);

      // Determine normalized route
      const baseUrl = req.baseUrl || "";
      const routePattern = (req.route && req.route.path) ? req.route.path : undefined;
      const normalizedRoute = siteAnalyticsService.normalizeRoute(baseUrl, req.path || "", routePattern);

      // Extract caller source attribution
      const callerHeader = req.headers["x-caller-page"] as string | undefined;
      const refererHeader = req.headers["referer"] as string | undefined;
      const callerPage = siteAnalyticsService.normalizeCallerPage(callerHeader, refererHeader);

      siteAnalyticsService.recordApiHit(
        req.method,
        normalizedRoute,
        callerPage,
        res.statusCode,
        latencyMs
      );
    } catch (err) {
      // Non-blocking telemetry
    }
  });

  next();
};

export default apiAnalyticsMiddleware;
