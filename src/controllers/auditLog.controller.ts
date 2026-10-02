import { Request, Response, NextFunction } from "express";
import AuditLog from "../models/AuditLog.model";

/**
 * @desc Get all audit logs with pagination, search, and multidimensional filters
 * @route GET /api/audit-logs
 */
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      search,
      targetType,
      action,
      actorName,
      range,
      month,
      year,
      page = "1",
      limit = "50",
    } = req.query;

    const filter: any = {};

    // 1. Text Search across targetTitle, description, actorName, actorEmail
    if (search && typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [
        { targetTitle: regex },
        { description: regex },
        { actorName: regex },
        { actorEmail: regex },
      ];
    }

    // 2. Target Module Filter
    if (targetType && targetType !== "all") {
      filter.targetType = targetType;
    }

    // 3. Action Filter
    if (action && action !== "all") {
      filter.action = action;
    }

    // 4. Actor Filter
    if (actorName && actorName !== "all") {
      filter.actorName = actorName;
    }

    // 5. Date Range Filtering (e.g. "last_month", "this_month", custom month/year)
    const now = new Date();
    if (range === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      filter.timestamp = { $gte: startOfLastMonth, $lte: endOfLastMonth };
    } else if (range === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filter.timestamp = { $gte: startOfMonth };
    } else if (month && year) {
      const m = parseInt(month as string, 10) - 1;
      const y = parseInt(year as string, 10);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      filter.timestamp = { $gte: start, $lte: end };
    }

    const p = Math.max(1, parseInt(page as string, 10) || 1);
    const lim = Math.max(1, parseInt(limit as string, 10) || 50);
    const skip = (p - 1) * lim;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(lim).lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Unique actors list for dropdown filters
    const actors = await AuditLog.distinct("actorName");

    res.status(200).json({
      success: true,
      logs,
      total,
      page: p,
      totalPages: Math.ceil(total / lim),
      actors: actors.filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Create an explicit audit log entry from frontend or server operations
 * @route POST /api/audit-logs
 */
export const createAuditLogEntry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { action, targetType, targetId, targetTitle, description, diff, metadata } = req.body;

    if (!action || !targetType || !targetTitle || !description) {
      return res.status(400).json({
        success: false,
        message: "Missing required audit fields: action, targetType, targetTitle, description",
      });
    }

    const entry = await AuditLog.create({
      actor: user?._id,
      actorName: user?.fullName || user?.name || "Staff Admin",
      actorEmail: user?.email,
      actorRole: user?.role || "admin",
      action,
      targetType,
      targetId,
      targetTitle,
      description,
      diff: Array.isArray(diff) ? diff : [],
      metadata: metadata || {},
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};
