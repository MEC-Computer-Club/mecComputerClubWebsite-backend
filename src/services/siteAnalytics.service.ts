import crypto from "crypto";
import DailyWebAnalytics from "../models/DailyWebAnalytics.model";
import DailyApiAnalytics from "../models/DailyApiAnalytics.model";

// Salt generated at process start (or could be from env) to anonymize IPs
const ANONYMIZATION_SALT = process.env.ANALYTICS_SALT || "mec_cc_telemetry_secure_salt_2026";

export interface ITrackPageViewInput {
  path: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  isFirstPage?: boolean;
  device?: "desktop" | "mobile" | "tablet";
  browser?: string;
  os?: string;
  referrer?: string;
}

export interface ITrackDurationInput {
  path: string;
  durationSeconds: number;
  sessionId?: string;
  isExit?: boolean;
}

export interface IApiHitBufferItem {
  date: string;
  method: string;
  route: string;
  totalHits: number;
  callers: Map<string, number>;
  statusBuckets: {
    s2xx: number;
    s3xx: number;
    s4xx: number;
    s5xx: number;
  };
  totalLatencyMs: number;
  maxLatencyMs: number;
}

export interface IPageViewBufferItem {
  date: string;
  path: string;
  visitorHash: string;
  sessionId?: string;
  isFirstPage?: boolean;
  device: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
  referrer: string;
}

export interface IPageDurationBufferItem {
  date: string;
  path: string;
  durationSeconds: number;
  isExit?: boolean;
}

class SiteAnalyticsService {
  private apiBuffer: Map<string, IApiHitBufferItem> = new Map();
  private pageViewBuffer: IPageViewBufferItem[] = [];
  private pageDurationBuffer: IPageDurationBufferItem[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor() {
    // Flush buffered metrics every 30 seconds
    this.flushTimer = setInterval(() => {
      this.flushToDatabase().catch((err) => {
        console.error("[SiteAnalytics] Periodic flush error:", err);
      });
    }, 30 * 1000);

    // Flush on process shutdown
    const handleShutdown = async () => {
      if (this.flushTimer) clearInterval(this.flushTimer);
      await this.flushToDatabase();
    };
    process.on("SIGINT", handleShutdown);
    process.on("SIGTERM", handleShutdown);
  }

  /**
   * Generates a date string: "YYYY-MM-DD"
   */
  public getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Generates an anonymous 16-char daily visitor hash (Zero PII stored)
   */
  public generateVisitorHash(ip: string = "127.0.0.1", userAgent: string = ""): string {
    const today = this.getTodayString();
    return crypto
      .createHash("sha256")
      .update(`${today}::${ANONYMIZATION_SALT}::${ip}::${userAgent}`)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Normalizes route path (replaces Mongo ObjectIds / UUIDs with :id)
   */
  public normalizeRoute(baseUrl: string, rawPath: string, routePattern?: string): string {
    if (routePattern && routePattern !== "*") {
      let combined = `${baseUrl}${routePattern}`;
      return combined.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    }

    let clean = `${baseUrl}${rawPath}`.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    // Replace 24-hex mongo ObjectIds with :id
    clean = clean.replace(/\/[a-fA-F0-9]{24}(\b|\/)/g, "/:id$1");
    // Replace UUIDs with :id
    clean = clean.replace(/\/[0-9a-fA-F-]{36}(\b|\/)/g, "/:id$1");
    return clean;
  }

  /**
   * Parses User-Agent for device, browser, and OS
   */
  public parseUserAgent(uaString: string = ""): {
    device: "desktop" | "mobile" | "tablet";
    browser: string;
    os: string;
  } {
    const ua = uaString.toLowerCase();

    // Device
    let device: "desktop" | "mobile" | "tablet" = "desktop";
    if (/(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(ua)) {
      device = "tablet";
    } else if (/(mobi|ipod|phone|blackberry|opera mini|fennec|minimo)/.test(ua)) {
      device = "mobile";
    }

    // Browser
    let browser = "Other";
    if (ua.includes("edg/")) browser = "Edge";
    else if (ua.includes("chrome/") && !ua.includes("edg/")) browser = "Chrome";
    else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";
    else if (ua.includes("firefox/")) browser = "Firefox";
    else if (ua.includes("opr/") || ua.includes("opera/")) browser = "Opera";

    // OS
    let os = "Other";
    if (ua.includes("windows nt 10")) os = "Windows 10/11";
    else if (ua.includes("windows")) os = "Windows";
    else if (ua.includes("android")) os = "Android";
    else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
    else if (ua.includes("macintosh") || ua.includes("mac os x")) os = "macOS";
    else if (ua.includes("linux")) os = "Linux";

    return { device, browser, os };
  }

  /**
   * Normalizes referrer domain (Google, Facebook, WhatsApp, LinkedIn, GitHub, Direct, etc.)
   */
  public normalizeReferrer(referrerUrl?: string): string {
    if (!referrerUrl || typeof referrerUrl !== "string" || !referrerUrl.trim()) {
      return "Direct";
    }
    const clean = referrerUrl.toLowerCase().trim();
    if (clean.includes("google.")) return "Google";
    if (clean.includes("facebook.") || clean.includes("fb.com") || clean.includes("messenger.")) return "Facebook";
    if (clean.includes("whatsapp.") || clean.includes("wa.me")) return "WhatsApp";
    if (clean.includes("linkedin.")) return "LinkedIn";
    if (clean.includes("github.")) return "GitHub";
    if (clean.includes("youtube.")) return "YouTube";
    if (clean.includes("t.co") || clean.includes("twitter.") || clean.includes("x.com")) return "X / Twitter";
    if (clean.includes("instagram.")) return "Instagram";

    try {
      const url = new URL(referrerUrl);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return "Other";
    }
  }

  /**
   * Normalizes caller page pathname (e.g. /cp-hub, /dashboard/members)
   */
  public normalizeCallerPage(callerHeader?: string, refererHeader?: string): string {
    if (callerHeader && typeof callerHeader === "string" && callerHeader.trim()) {
      const trimmed = callerHeader.trim().split("?")[0];
      return trimmed.startsWith("/") ? trimmed.slice(0, 80) : `/${trimmed.slice(0, 80)}`;
    }
    if (refererHeader && typeof refererHeader === "string") {
      try {
        const url = new URL(refererHeader);
        return url.pathname.slice(0, 80) || "/";
      } catch {
        // Ignored
      }
    }
    return "Direct / Unknown";
  }

  /**
   * Records an API hit to the in-memory buffer (0ms request overhead)
   */
  public recordApiHit(
    method: string,
    route: string,
    callerPage: string,
    statusCode: number,
    latencyMs: number
  ): void {
    const date = this.getTodayString();
    const cleanMethod = (method || "GET").toUpperCase();
    const key = `${date}:::${cleanMethod}:::${route}`;

    let item = this.apiBuffer.get(key);
    if (!item) {
      item = {
        date,
        method: cleanMethod,
        route,
        totalHits: 0,
        callers: new Map(),
        statusBuckets: { s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 },
        totalLatencyMs: 0,
        maxLatencyMs: 0,
      };
      this.apiBuffer.set(key, item);
    }

    item.totalHits += 1;
    item.totalLatencyMs += latencyMs;
    if (latencyMs > item.maxLatencyMs) {
      item.maxLatencyMs = latencyMs;
    }

    // Status code buckets
    if (statusCode >= 200 && statusCode < 300) item.statusBuckets.s2xx += 1;
    else if (statusCode >= 300 && statusCode < 400) item.statusBuckets.s3xx += 1;
    else if (statusCode >= 400 && statusCode < 500) item.statusBuckets.s4xx += 1;
    else if (statusCode >= 500) item.statusBuckets.s5xx += 1;

    // Caller attribution
    const callerCount = item.callers.get(callerPage) || 0;
    item.callers.set(callerPage, callerCount + 1);
  }

  /**
   * Records a page view to the in-memory buffer
   */
  public recordPageView(input: ITrackPageViewInput): void {
    // Ignore internal admin dashboard routes from public traffic figures if desired,
    // but keep track of non-sensitive page visits
    const cleanPath = input.path.split("?")[0] || "/";
    const date = this.getTodayString();
    const visitorHash = this.generateVisitorHash(input.ip, input.userAgent);
    const parsedUa = this.parseUserAgent(input.userAgent);
    const referrer = this.normalizeReferrer(input.referrer);

    this.pageViewBuffer.push({
      date,
      path: cleanPath,
      visitorHash,
      sessionId: input.sessionId,
      isFirstPage: input.isFirstPage,
      device: input.device || parsedUa.device,
      browser: input.browser || parsedUa.browser,
      os: input.os || parsedUa.os,
      referrer,
    });
  }

  /**
   * Records active dwell time spent on a page
   */
  public recordPageDuration(input: ITrackDurationInput): void {
    if (input.durationSeconds <= 0) return;
    const cleanPath = input.path.split("?")[0] || "/";
    const date = this.getTodayString();

    // Cap duration to 3600 seconds per ping to prevent crazy outlier values
    const safeSeconds = Math.min(Math.round(input.durationSeconds), 3600);

    this.pageDurationBuffer.push({
      date,
      path: cleanPath,
      durationSeconds: safeSeconds,
      isExit: input.isExit,
    });
  }

  /**
   * Flushes in-memory buffers to MongoDB using atomic roll-up updates
   */
  public async flushToDatabase(): Promise<void> {
    if (this.isFlushing) return;
    if (
      this.apiBuffer.size === 0 &&
      this.pageViewBuffer.length === 0 &&
      this.pageDurationBuffer.length === 0
    ) {
      return;
    }

    this.isFlushing = true;
    try {
      // 1. Snapshot and clear in-memory buffers
      const apiEntries = Array.from(this.apiBuffer.values());
      this.apiBuffer.clear();

      const pageViews = this.pageViewBuffer.splice(0, this.pageViewBuffer.length);
      const durations = this.pageDurationBuffer.splice(0, this.pageDurationBuffer.length);

      // 2. Flush API Analytics
      for (const entry of apiEntries) {
        const incFields: Record<string, number> = {
          totalHits: entry.totalHits,
          totalLatencyMs: entry.totalLatencyMs,
          "statusBuckets.s2xx": entry.statusBuckets.s2xx,
          "statusBuckets.s3xx": entry.statusBuckets.s3xx,
          "statusBuckets.s4xx": entry.statusBuckets.s4xx,
          "statusBuckets.s5xx": entry.statusBuckets.s5xx,
        };

        // Add callers atomic inc
        for (const [caller, count] of entry.callers.entries()) {
          // Replace dots in caller path to prevent MongoDB nested path interpretation
          const safeCaller = caller.replace(/\./g, "_");
          incFields[`callers.${safeCaller}`] = count;
        }

        const existingDoc = await DailyApiAnalytics.findOne({
          date: entry.date,
          method: entry.method,
          route: entry.route,
        });

        const newMaxLatency = existingDoc
          ? Math.max(existingDoc.maxLatencyMs || 0, entry.maxLatencyMs)
          : entry.maxLatencyMs;

        const updated = await DailyApiAnalytics.findOneAndUpdate(
          {
            date: entry.date,
            method: entry.method,
            route: entry.route,
          },
          {
            $inc: incFields,
            $max: { maxLatencyMs: newMaxLatency },
          },
          { upsert: true, new: true }
        );

        if (updated && updated.totalHits > 0) {
          updated.avgLatencyMs = Math.round(updated.totalLatencyMs / updated.totalHits);
          await updated.save();
        }
      }

      // 3. Group and flush Page Views
      if (pageViews.length > 0) {
        const viewsByDate = new Map<string, IPageViewBufferItem[]>();
        for (const pv of pageViews) {
          const list = viewsByDate.get(pv.date) || [];
          list.push(pv);
          viewsByDate.set(pv.date, list);
        }

        for (const [date, views] of viewsByDate.entries()) {
          const pageCountMap = new Map<string, number>();
          const deviceCountMap = { desktop: 0, mobile: 0, tablet: 0 };
          const browserCountMap = new Map<string, number>();
          const osCountMap = new Map<string, number>();
          const referrerCountMap = new Map<string, number>();
          const visitorHashSet = new Set<string>();
          let newSessionsCount = 0;

          for (const v of views) {
            visitorHashSet.add(v.visitorHash);
            pageCountMap.set(v.path, (pageCountMap.get(v.path) || 0) + 1);
            deviceCountMap[v.device] = (deviceCountMap[v.device] || 0) + 1;
            browserCountMap.set(v.browser, (browserCountMap.get(v.browser) || 0) + 1);
            osCountMap.set(v.os, (osCountMap.get(v.os) || 0) + 1);
            referrerCountMap.set(v.referrer, (referrerCountMap.get(v.referrer) || 0) + 1);
            if (v.isFirstPage) newSessionsCount += 1;
          }

          // Build atomic MongoDB update
          const incFields: Record<string, number> = {
            totalPageViews: views.length,
            sessionsCount: newSessionsCount,
            "devices.desktop": deviceCountMap.desktop,
            "devices.mobile": deviceCountMap.mobile,
            "devices.tablet": deviceCountMap.tablet,
          };

          for (const [br, count] of browserCountMap.entries()) {
            incFields[`browsers.${br.replace(/\./g, "_")}`] = count;
          }
          for (const [os, count] of osCountMap.entries()) {
            incFields[`os.${os.replace(/\./g, "_")}`] = count;
          }
          for (const [ref, count] of referrerCountMap.entries()) {
            incFields[`referrers.${ref.replace(/\./g, "_")}`] = count;
          }

          // Upsert the daily record
          const dailyDoc = await DailyWebAnalytics.findOneAndUpdate(
            { date },
            {
              $inc: incFields,
              $addToSet: {
                uniqueVisitorHashes: { $each: Array.from(visitorHashSet) },
              },
            },
            { upsert: true, new: true }
          );

          // Update pages array views
          if (dailyDoc) {
            for (const [path, count] of pageCountMap.entries()) {
              const existingPage = dailyDoc.pages.find((p) => p.path === path);
              if (existingPage) {
                existingPage.views += count;
              } else {
                dailyDoc.pages.push({
                  path,
                  views: count,
                  totalSecondsSpent: 0,
                  entryCount: 0,
                  exitCount: 0,
                });
              }
            }
            dailyDoc.uniqueVisitorsCount = dailyDoc.uniqueVisitorHashes.length;
            await dailyDoc.save();
          }
        }
      }

      // 4. Group and flush Page Durations
      if (durations.length > 0) {
        const durationsByDate = new Map<string, IPageDurationBufferItem[]>();
        for (const d of durations) {
          const list = durationsByDate.get(d.date) || [];
          list.push(d);
          durationsByDate.set(d.date, list);
        }

        for (const [date, items] of durationsByDate.entries()) {
          const dailyDoc = await DailyWebAnalytics.findOne({ date });
          if (!dailyDoc) continue;

          for (const item of items) {
            const page = dailyDoc.pages.find((p) => p.path === item.path);
            if (page) {
              page.totalSecondsSpent += item.durationSeconds;
              if (item.isExit) page.exitCount += 1;
            } else {
              dailyDoc.pages.push({
                path: item.path,
                views: 1,
                totalSecondsSpent: item.durationSeconds,
                entryCount: 0,
                exitCount: item.isExit ? 1 : 0,
              });
            }
          }
          await dailyDoc.save();
        }
      }
    } catch (error) {
      console.error("[SiteAnalytics] Failed to flush to database:", error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Generates start and end dates based on filter range ('24h' | '7d' | '30d' | '90d')
   */
  private getDateList(range: string = "7d"): string[] {
    let days = 7;
    if (range === "24h") days = 1;
    else if (range === "30d") days = 30;
    else if (range === "90d") days = 90;

    const list: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      list.push(`${year}-${month}-${day}`);
    }
    return list;
  }

  /**
   * Retrieves high-level analytics summary for the independent Dashboard Analytics page
   */
  public async getAnalyticsSummary(range: "24h" | "7d" | "30d" | "90d" = "7d") {
    // Flush pending memory buffer so stats are 100% up to date
    await this.flushToDatabase();

    const dateList = this.getDateList(range);
    const startDate = dateList[0];
    const endDate = dateList[dateList.length - 1];

    // 1. Fetch web analytics
    const webDocs = await DailyWebAnalytics.find({
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // 2. Fetch API analytics
    const apiDocs = await DailyApiAnalytics.find({
      date: { $gte: startDate, $lte: endDate },
    }).sort({ totalHits: -1 });

    // Aggregations
    let totalPageViews = 0;
    let totalUniqueVisitors = 0;
    let totalSessions = 0;
    let totalSeconds = 0;
    const globalVisitorSet = new Set<string>();

    const dailyTrendMap = new Map<
      string,
      { date: string; views: number; uniqueVisitors: number; sessions: number }
    >();
    for (const d of dateList) {
      dailyTrendMap.set(d, { date: d, views: 0, uniqueVisitors: 0, sessions: 0 });
    }

    const pagesMap = new Map<
      string,
      { path: string; views: number; totalSeconds: number; exits: number }
    >();

    const devices = { desktop: 0, mobile: 0, tablet: 0 };
    const browsers: Record<string, number> = {};
    const osMap: Record<string, number> = {};
    const referrers: Record<string, number> = {};

    for (const doc of webDocs) {
      totalPageViews += doc.totalPageViews;
      totalSessions += doc.sessionsCount || 0;
      doc.uniqueVisitorHashes?.forEach((h) => globalVisitorSet.add(h));

      const trend = dailyTrendMap.get(doc.date);
      if (trend) {
        trend.views += doc.totalPageViews;
        trend.uniqueVisitors += doc.uniqueVisitorsCount || doc.uniqueVisitorHashes?.length || 0;
        trend.sessions += doc.sessionsCount || 0;
      }

      // Pages
      if (doc.pages && Array.isArray(doc.pages)) {
        for (const p of doc.pages) {
          const existing = pagesMap.get(p.path) || {
            path: p.path,
            views: 0,
            totalSeconds: 0,
            exits: 0,
          };
          existing.views += p.views;
          existing.totalSeconds += p.totalSecondsSpent || 0;
          existing.exits += p.exitCount || 0;
          pagesMap.set(p.path, existing);
          totalSeconds += p.totalSecondsSpent || 0;
        }
      }

      // Devices
      devices.desktop += doc.devices?.desktop || 0;
      devices.mobile += doc.devices?.mobile || 0;
      devices.tablet += doc.devices?.tablet || 0;

      // Browsers
      if (doc.browsers instanceof Map) {
        for (const [k, v] of doc.browsers.entries()) {
          browsers[k] = (browsers[k] || 0) + v;
        }
      } else if (doc.browsers && typeof doc.browsers === "object") {
        for (const [k, v] of Object.entries(doc.browsers)) {
          browsers[k] = (browsers[k] || 0) + Number(v);
        }
      }

      // OS
      if (doc.os instanceof Map) {
        for (const [k, v] of doc.os.entries()) {
          osMap[k] = (osMap[k] || 0) + v;
        }
      } else if (doc.os && typeof doc.os === "object") {
        for (const [k, v] of Object.entries(doc.os)) {
          osMap[k] = (osMap[k] || 0) + Number(v);
        }
      }

      // Referrers
      if (doc.referrers instanceof Map) {
        for (const [k, v] of doc.referrers.entries()) {
          referrers[k] = (referrers[k] || 0) + v;
        }
      } else if (doc.referrers && typeof doc.referrers === "object") {
        for (const [k, v] of Object.entries(doc.referrers)) {
          referrers[k] = (referrers[k] || 0) + Number(v);
        }
      }
    }

    totalUniqueVisitors = globalVisitorSet.size;

    // Ranked Pages
    const topPages = Array.from(pagesMap.values())
      .map((p) => {
        const avgSeconds = p.views > 0 ? Math.round(p.totalSeconds / p.views) : 0;
        const percentage = totalPageViews > 0 ? ((p.views / totalPageViews) * 100).toFixed(1) : "0";
        return {
          path: p.path,
          views: p.views,
          totalSeconds: p.totalSeconds,
          avgSeconds,
          avgDurationFormatted: this.formatDuration(avgSeconds),
          percentage: Number(percentage),
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 15);

    // API hits aggregation (merging routes across multiple days in range)
    const apiRouteMap = new Map<
      string,
      {
        method: string;
        route: string;
        totalHits: number;
        totalLatencyMs: number;
        maxLatencyMs: number;
        statusBuckets: { s2xx: number; s3xx: number; s4xx: number; s5xx: number };
        callers: Map<string, number>;
      }
    >();

    let totalApiHits = 0;
    for (const doc of apiDocs) {
      totalApiHits += doc.totalHits;
      const key = `${doc.method}:::${doc.route}`;
      let item = apiRouteMap.get(key);
      if (!item) {
        item = {
          method: doc.method,
          route: doc.route,
          totalHits: 0,
          totalLatencyMs: 0,
          maxLatencyMs: 0,
          statusBuckets: { s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 },
          callers: new Map(),
        };
        apiRouteMap.set(key, item);
      }

      item.totalHits += doc.totalHits;
      item.totalLatencyMs += doc.totalLatencyMs || 0;
      item.maxLatencyMs = Math.max(item.maxLatencyMs, doc.maxLatencyMs || 0);
      item.statusBuckets.s2xx += doc.statusBuckets?.s2xx || 0;
      item.statusBuckets.s3xx += doc.statusBuckets?.s3xx || 0;
      item.statusBuckets.s4xx += doc.statusBuckets?.s4xx || 0;
      item.statusBuckets.s5xx += doc.statusBuckets?.s5xx || 0;

      if (doc.callers instanceof Map) {
        for (const [c, count] of doc.callers.entries()) {
          item.callers.set(c, (item.callers.get(c) || 0) + count);
        }
      } else if (doc.callers && typeof doc.callers === "object") {
        for (const [c, count] of Object.entries(doc.callers)) {
          item.callers.set(c, (item.callers.get(c) || 0) + Number(count));
        }
      }
    }

    // Top API Endpoints with Callers Attribution
    const topApiEndpoints = Array.from(apiRouteMap.values())
      .map((item) => {
        const avgLatencyMs = item.totalHits > 0 ? Math.round(item.totalLatencyMs / item.totalHits) : 0;
        const callerBreakdown = Array.from(item.callers.entries())
          .map(([caller, hits]) => ({
            caller,
            hits,
            percentage: item.totalHits > 0 ? Number(((hits / item.totalHits) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => b.hits - a.hits);

        return {
          method: item.method,
          route: item.route,
          totalHits: item.totalHits,
          avgLatencyMs,
          maxLatencyMs: item.maxLatencyMs,
          statusBuckets: item.statusBuckets,
          callers: callerBreakdown,
        };
      })
      .sort((a, b) => b.totalHits - a.totalHits)
      .slice(0, 25);

    // Summary calculations
    const avgDwellTimeSeconds = totalPageViews > 0 ? Math.round(totalSeconds / totalPageViews) : 0;
    const bounceRate =
      totalSessions > 0
        ? Number((Math.min(100, (Math.max(0, totalSessions - totalPageViews + 1) / totalSessions) * 100)).toFixed(1))
        : 0;

    return {
      timeRange: range,
      summary: {
        totalPageViews,
        uniqueVisitors: totalUniqueVisitors,
        totalSessions,
        totalApiHits,
        avgDwellTimeSeconds,
        avgDwellTimeFormatted: this.formatDuration(avgDwellTimeSeconds),
        bounceRate: Math.max(0, Math.min(100, bounceRate)),
      },
      dailyTrend: Array.from(dailyTrendMap.values()),
      topPages,
      devices,
      browsers,
      os: osMap,
      referrers,
      topApiEndpoints,
    };
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
}

export const siteAnalyticsService = new SiteAnalyticsService();
export default siteAnalyticsService;
