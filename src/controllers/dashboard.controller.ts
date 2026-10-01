// src/controllers/dashboard.controller.ts

import { Request, Response, NextFunction } from "express";
import {
  getMemberDashboardData,
  getAdminDashboardStats,
  getMembersDataService,
  getApplicationByIdService,
  approveOrRejectUser,
  getVisualOverviewDataService,
} from "../services/dashboard.service";
import UserModel from "../models/User.model";
import { getCloudinaryUsageStats } from "../services/upload.service";
import app from "../app";

// --- MEMBER CONTROLLER ---
export const getMemberDashboard = async (req: Request, res: Response, next: NextFunction) => {
  // Note: authMiddleware must run before this to set req.user
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated." });
  }

  try {
    const data = await getMemberDashboardData(userId);

    return res.status(200).json({
      success: true,
      data,
      message: "Member dashboard data fetched successfully.",
    });
  } catch (error) {
    // In a real app, you might log the error here
    next(error); // Pass error to Express error handler
  }
};

// --- ADMIN CONTROLLER ---
export const getAdminDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getAdminDashboardStats();

    return res.status(200).json({
      success: true,
      data: stats,
      message: "Admin dashboard stats fetched successfully.",
    });
  } catch (error) {
    // In a real app, you might log the error here
    next(error); // Pass error to Express error handler
  }
};

export const getMembersData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tab, filter, search, page, limit } = req.query;
    const data = await getMembersDataService({
      tab: tab as any,
      filter: filter as string,
      search: search as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return res.status(200).json({
      success: true,
      data,
      message: "Members data fetched successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const getUsersByFiltering = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filter, fields } = req.body;
    if (filter === undefined) {
      const users = await UserModel.find({}, fields);
      return res.status(200).json({
        success: true,
        data: users,
        message: "All users fetched successfully.",
      });
    } else {
      const { property, value } = filter;
      const query = { [property]: value };
      const users = await UserModel.find(query, fields);
      return res.status(200).json({
        success: true,
        data: users,
        message: "Filtered users fetched successfully.",
      });
    }
  } catch (error) {
    console.log("Error while fetching users:", error);
    next(error);
  }
};

export const updateApplicationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const updatedUser = await approveOrRejectUser(req.user?.id as string, id, status, reason);
    return res.status(200).json({
      success: true,
      data: updatedUser,
      message:
        status === "approved"
          ? "User approved and status updated"
          : "User rejected and status updated",
    });
  } catch (error) {
    console.log("Error while updating application status:", error);
    next(error);
  }
};

export const getApplicationDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const applicant = await getApplicationByIdService(id);
    return res.status(200).json({
      success: true,
      data: applicant,
      message: "Applicant details retrieved successfully.",
    });
  } catch (error) {
    console.error("Error while fetching applicant details:", error);
    next(error);
  }
};

export const getVisualOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getVisualOverviewDataService();
    return res.status(200).json({
      success: true,
      data,
      message: "Visual overview stats fetched successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const getCloudinaryStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getCloudinaryUsageStats();
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

