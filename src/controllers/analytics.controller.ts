import { Request, Response, NextFunction } from "express";
import ToolUsage from "../models/ToolUsage.model";
import Institute from "../models/Institute.model";

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export function normalizeDepartmentCode(dept?: string): string | undefined {
  if (!dept) return undefined;
  const upper = dept.toUpperCase().trim();
  if (upper.includes("COMPUTER") || upper.includes("CSE")) return "CSE";
  if (upper.includes("ELECTRICAL") || upper.includes("EEE")) return "EEE";
  if (upper.includes("CIVIL") || upper.includes("CE")) return "CE";
  return dept.trim().toUpperCase();
}

export const trackUsage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tool, action, instituteName, department, session, semester } = req.body;

    if (!tool || !action) {
      return res.status(400).json({
        status: "fail",
        message: "Tool and action are required",
      });
    }

    const rawInstName = instituteName && typeof instituteName === "string" && instituteName.trim()
      ? instituteName.trim()
      : "Guest User";

    let cleanInstName = rawInstName;
    if (rawInstName.toLowerCase() === "guest user" || rawInstName.toLowerCase() === "guest") {
      cleanInstName = "Guest User";
    } else {
      // Resolve institute against aliases (e.g., "MEC" maps to "Mymensingh Engineering College")
      const existingInst = await Institute.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${escapeRegex(rawInstName)}$`, "i") } },
          { aliases: { $regex: new RegExp(`^${escapeRegex(rawInstName)}$`, "i") } },
        ],
      });
      cleanInstName = existingInst ? existingInst.name : rawInstName;
    }
    const semNum = semester ? parseInt(semester, 10) : undefined;
    const userId = (req as any).user?.id || null;
    const cleanDept = normalizeDepartmentCode(department);

    // 1. Record individual usage event
    await ToolUsage.create({
      tool,
      action,
      instituteName: cleanInstName,
      department: cleanDept || undefined,
      session: session?.trim() || undefined,
      semester: !isNaN(semNum as number) ? semNum : undefined,
      userId,
    });

    // 2. Atomically upsert institute counter
    const incField: any = { "usageCount.total": 1 };
    if (tool === "cover_page" && (action === "print" || action === "export_pdf")) {
      incField["usageCount.coverPagePrints"] = 1;
    } else if (tool === "cgpa_calculator") {
      incField["usageCount.cgpaCalculations"] = 1;
    }

    await Institute.findOneAndUpdate(
      { name: { $regex: new RegExp(`^${escapeRegex(cleanInstName)}$`, "i") } },
      {
        $setOnInsert: {
          name: cleanInstName,
        },
        $inc: incField,
        $set: { lastUsedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      status: "success",
      message: "Usage tracked successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalEvents,
      totalPrints,
      totalCalculations,
      deptAggregates,
      recentActivity,
    ] = await Promise.all([
      ToolUsage.countDocuments(),
      ToolUsage.countDocuments({
        tool: "cover_page",
        action: { $in: ["print", "export_pdf"] },
      }),
      ToolUsage.countDocuments({
        tool: "cgpa_calculator",
        action: { $in: ["calculate", "gpa_calculate", "cgpa_calculate"] },
      }),
      ToolUsage.aggregate([
        {
          $group: {
            _id: {
              instituteName: "$instituteName",
              department: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$department", null] },
                      { $eq: ["$department", ""] },
                    ],
                  },
                  "General / Unspecified",
                  "$department",
                ],
              },
            },
            coverPagePrints: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$tool", "cover_page"] },
                      { $in: ["$action", ["print", "export_pdf"]] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            cgpaCalculations: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$tool", "cgpa_calculator"] },
                      { $in: ["$action", ["calculate", "gpa_calculate", "cgpa_calculate"]] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            total: { $sum: 1 },
            lastUsedAt: { $max: "$createdAt" },
          },
        },
        {
          $sort: { total: -1 },
        },
      ]),
      ToolUsage.find()
        .sort({ createdAt: -1 })
        .limit(15)
        .populate("userId", "fullName studentId")
        .lean(),
    ]);

    // Group department aggregates by institute
    const instituteMap = new Map<
      string,
      {
        _id?: string;
        name: string;
        usageCount: {
          coverPagePrints: number;
          cgpaCalculations: number;
          total: number;
        };
        lastUsedAt: Date;
        departments: Array<{
          department: string;
          coverPagePrints: number;
          cgpaCalculations: number;
          total: number;
          lastUsedAt?: Date;
        }>;
      }
    >();

    // Clean up any historical legacy department strings in ToolUsage
    try {
      await ToolUsage.updateMany(
        { department: { $regex: /computer/i, $ne: "CSE" } },
        { $set: { department: "CSE" } }
      );
      await ToolUsage.updateMany(
        { department: { $regex: /electrical/i, $ne: "EEE" } },
        { $set: { department: "EEE" } }
      );
      await ToolUsage.updateMany(
        { department: { $regex: /civil/i, $ne: "CE" } },
        { $set: { department: "CE" } }
      );
    } catch {
      // Non-blocking
    }

    for (const item of deptAggregates) {
      const rawInstName = item._id.instituteName || "Guest User";
      const cleanInstName = rawInstName.trim();
      const rawDeptName = item._id.department;
      const deptName = normalizeDepartmentCode(rawDeptName) || rawDeptName || "General / Unspecified";

      if (!instituteMap.has(cleanInstName)) {
        instituteMap.set(cleanInstName, {
          name: cleanInstName,
          usageCount: {
            coverPagePrints: 0,
            cgpaCalculations: 0,
            total: 0,
          },
          lastUsedAt: item.lastUsedAt || new Date(),
          departments: [],
        });
      }

      const inst = instituteMap.get(cleanInstName)!;
      inst.usageCount.coverPagePrints += item.coverPagePrints;
      inst.usageCount.cgpaCalculations += item.cgpaCalculations;
      inst.usageCount.total += item.total;
      if (item.lastUsedAt && (!inst.lastUsedAt || new Date(item.lastUsedAt) > new Date(inst.lastUsedAt))) {
        inst.lastUsedAt = item.lastUsedAt;
      }

      const existingDept = inst.departments.find(
        (d) => d.department.toUpperCase() === deptName.toUpperCase()
      );
      if (existingDept) {
        existingDept.coverPagePrints += item.coverPagePrints;
        existingDept.cgpaCalculations += item.cgpaCalculations;
        existingDept.total += item.total;
        if (item.lastUsedAt && (!existingDept.lastUsedAt || new Date(item.lastUsedAt) > new Date(existingDept.lastUsedAt))) {
          existingDept.lastUsedAt = item.lastUsedAt;
        }
      } else {
        inst.departments.push({
          department: deptName,
          coverPagePrints: item.coverPagePrints,
          cgpaCalculations: item.cgpaCalculations,
          total: item.total,
          lastUsedAt: item.lastUsedAt,
        });
      }
    }

    // Merge with DB Institute models so institute records without granular ToolUsage rows also show up
    const dbInstitutes = await Institute.find().lean();
    for (const dbInst of dbInstitutes) {
      const cleanName = dbInst.name.trim();
      const prints = dbInst.usageCount?.coverPagePrints || 0;
      const calcs = dbInst.usageCount?.cgpaCalculations || 0;
      const total = prints + calcs;

      if (!instituteMap.has(cleanName)) {
        if (total > 0) {
          instituteMap.set(cleanName, {
            _id: String(dbInst._id),
            name: cleanName,
            usageCount: {
              coverPagePrints: prints,
              cgpaCalculations: calcs,
              total,
            },
            lastUsedAt: dbInst.lastUsedAt || new Date(),
            departments: [],
          });
        }
      } else {
        const existing = instituteMap.get(cleanName)!;
        existing._id = String(dbInst._id);
        // Ensure counters are at least what the institute document recorded
        if (dbInst.usageCount?.total && dbInst.usageCount.total > existing.usageCount.total) {
          existing.usageCount = {
            coverPagePrints: Math.max(existing.usageCount.coverPagePrints, prints),
            cgpaCalculations: Math.max(existing.usageCount.cgpaCalculations, calcs),
            total: Math.max(existing.usageCount.total, total),
          };
        }
      }
    }

    // Sort institutes by total usage descending
    const sortedInstitutes = Array.from(instituteMap.values())
      .sort((a, b) => b.usageCount.total - a.usageCount.total)
      .slice(0, 30);

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalEvents,
          totalPrints,
          totalCalculations,
        },
        topInstitutes: sortedInstitutes,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};
