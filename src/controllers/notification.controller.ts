import { Request, Response } from "express";
import * as notificationService from "../services/notification.service";
import Notification from "../models/Notification.model";

/**
 * GET /api/notifications
 * Returns authenticated user's notifications + unreadCount
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const filter = (req.query.filter as any) || "all";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const data = await notificationService.getUserNotifications(
      user.id,
      user.role,
      { filter, page, limit }
    );

    return res.status(200).json({
      success: true,
      data: data.items,
      notifications: data.items,
      unreadCount: data.unreadCount,
      total: data.total,
      page: data.page,
      limit: data.limit,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notifications",
    });
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a specific notification as read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: "Notification ID is required" });
    }

    const updated = await notificationService.markNotificationAsRead(id, user.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current user
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await notificationService.markAllNotificationsAsRead(user.id, user.role);

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark all notifications as read",
    });
  }
};

/**
 * DELETE /api/notifications/:id
 * Dismiss a notification for current user
 */
export const dismiss = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: "Notification ID is required" });
    }

    await notificationService.dismissNotification(id, user.id);

    return res.status(200).json({
      success: true,
      message: "Notification dismissed",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to dismiss notification",
    });
  }
};

/**
 * DELETE /api/notifications/clear-all
 * Dismiss all active notifications for current user
 */
export const clearAll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await notificationService.clearAllNotifications(user.id, user.role);

    return res.status(200).json({
      success: true,
      message: "All notifications cleared",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to clear notifications",
    });
  }
};

/**
 * POST /api/notifications/broadcast
 * Executive/Admin endpoint to send custom broadcast announcement
 */
export const sendBroadcast = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ success: false, message: "Forbidden: Executive permission required" });
    }

    const { title, message, link, actionLabel, priority, recipientRole } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required" });
    }

    const notif = await notificationService.createBroadcastNotification({
      type: "announcement",
      title: title.trim(),
      message: message.trim(),
      link: link?.trim() || "",
      actionLabel: actionLabel?.trim() || "View Details",
      priority: priority || "normal",
      recipientRole: recipientRole || "all",
      metadata: { dispatchedBy: user.id },
    });

    return res.status(201).json({
      success: true,
      message: "Broadcast announcement dispatched",
      data: notif,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to dispatch broadcast notification",
    });
  }
};

/**
 * GET /api/notifications/broadcasts
 * Fetch all broadcast announcements
 */
export const getBroadcasts = async (req: Request, res: Response) => {
  try {
    const broadcasts = await Notification.find({ recipient: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.status(200).json({ success: true, data: broadcasts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch broadcasts" });
  }
};

/**
 * DELETE /api/notifications/broadcasts/:id
 * Delete or revoke a broadcast announcement
 */
export const deleteBroadcast = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: "Broadcast deleted successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete broadcast" });
  }
};
