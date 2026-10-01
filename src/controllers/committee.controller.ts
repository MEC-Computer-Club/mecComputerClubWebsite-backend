import { Request, Response, NextFunction } from "express";
import * as committeeService from "../services/committee.service";

/**
 * @desc Get list of all committee terms (for dropdown / archive switcher)
 * @route GET /api/committees
 */
export const getCommittees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await committeeService.getCommitteesListService();
    res.status(200).json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get committee details by term, or default current active committee
 * @route GET /api/committees/term/:term or GET /api/committees/current
 */
export const getCommitteeByTerm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { term } = req.params;
    const targetTerm = term === "current" ? undefined : term;
    const committee = await committeeService.getCommitteeByTermService(targetTerm);

    if (!committee) {
      return res.status(404).json({
        success: false,
        message: "No committee found for the specified term.",
      });
    }

    res.status(200).json({
      success: true,
      data: committee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Create a new committee
 * @route POST /api/committees
 */
export const createCommittee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newCommittee = await committeeService.createCommitteeService(req.body);
    res.status(201).json({
      success: true,
      message: "Committee created successfully.",
      data: newCommittee,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create committee.",
    });
  }
};

/**
 * @desc Update an existing committee
 * @route PUT /api/committees/:id
 */
export const updateCommittee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updated = await committeeService.updateCommitteeService(id, req.body);
    res.status(200).json({
      success: true,
      message: "Committee updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update committee.",
    });
  }
};

/**
 * @desc Delete a committee
 * @route DELETE /api/committees/:id
 */
export const deleteCommittee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await committeeService.deleteCommitteeService(id);
    res.status(200).json({
      success: true,
      message: "Committee deleted successfully.",
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete committee.",
    });
  }
};
