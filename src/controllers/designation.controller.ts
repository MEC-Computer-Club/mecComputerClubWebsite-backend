import { Request, Response, NextFunction } from "express";
import * as designationService from "../services/designation.service";

export const getDesignations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = req.query.category as string | undefined;
    const designations = await designationService.getDesignationsService(category);
    res.status(200).json({
      status: "success",
      data: designations,
    });
  } catch (error) {
    next(error);
  }
};

export const createDesignation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, category, order, maxSeats, defaultRole } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ status: "fail", message: "Designation title is required" });
    }

    const newDesignation = await designationService.createDesignationService({
      title,
      category: category || "executive",
      order,
      maxSeats,
      defaultRole,
    });

    res.status(201).json({
      status: "success",
      message: "Designation created successfully",
      data: newDesignation,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: "fail",
        message: "A designation with this title already exists in this category.",
      });
    }
    next(error);
  }
};

export const updateDesignation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updated = await designationService.updateDesignationService(id, req.body);
    res.status(200).json({
      status: "success",
      message: "Designation updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const reorderDesignations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ status: "fail", message: "Items array is required" });
    }

    const result = await designationService.reorderDesignationsService(items);
    res.status(200).json({
      status: "success",
      message: "Precedence order updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDesignation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await designationService.deleteDesignationService(id);
    res.status(200).json({
      status: "success",
      message: "Designation deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const assignMembersToDesignation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, category, memberIds, defaultRole } = req.body;

    if (!title || !Array.isArray(memberIds)) {
      return res.status(400).json({
        status: "fail",
        message: "Title and memberIds array are required",
      });
    }

    const result = await designationService.assignMembersToDesignationService(
      title,
      category || "executive",
      memberIds,
      defaultRole
    );

    res.status(200).json({
      status: "success",
      message: "Members assigned to designation successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
