import { Request, Response, NextFunction } from "express";
import Institute from "../models/Institute.model";

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export const searchInstitutes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = req.query;
    const filter: any = {};

    if (q && typeof q === "string" && q.trim()) {
      const escaped = escapeRegex(q.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { aliases: { $regex: escaped, $options: "i" } },
      ];
    }

    const institutes = await Institute.find(filter)
      .sort({ "usageCount.total": -1, name: 1 })
      .limit(15)
      .lean();

    res.status(200).json({
      status: "success",
      count: institutes.length,
      data: institutes,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllInstitutes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = "1", limit = "25" } = req.query;
    const filter: any = {};

    if (search && typeof search === "string" && search.trim()) {
      const escaped = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { aliases: { $regex: escaped, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const [institutes, total] = await Promise.all([
      Institute.find(filter)
        .sort({ "usageCount.total": -1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Institute.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      data: institutes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createInstitute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, aliases } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        status: "fail",
        message: "Institute name is required",
      });
    }

    const cleanName = name.trim();
    const existing = await Institute.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, "i") },
    });

    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Institute already exists",
        data: existing,
      });
    }

    const cleanAliases = Array.isArray(aliases)
      ? aliases.map((a: string) => a.trim()).filter(Boolean)
      : [];

    const newInst = await Institute.create({
      name: cleanName,
      aliases: cleanAliases,
      usageCount: { cgpaCalculations: 0, coverPagePrints: 0, total: 0 },
      lastUsedAt: new Date(),
    });

    res.status(201).json({
      status: "success",
      data: newInst,
    });
  } catch (error) {
    next(error);
  }
};
