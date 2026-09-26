import { Request, Response, NextFunction } from "express";
import Course from "../models/Course.model";

export function normalizeDepartment(dept?: string): string {
  if (!dept) return "CSE";
  const upper = dept.toUpperCase();
  if (upper.includes("COMPUTER") || upper.includes("CSE")) return "CSE";
  if (upper.includes("ELECTRICAL") || upper.includes("EEE")) return "EEE";
  if (upper.includes("CIVIL") || upper.includes("CE")) return "CE";
  return dept.trim().toUpperCase();
}

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export const searchCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, department } = req.query;
    const filter: any = { status: "approved" };

    if (department) {
      filter.department = normalizeDepartment(department as string);
    }

    if (q && typeof q === "string" && q.trim()) {
      const escaped = escapeRegex(q.trim());
      filter.$or = [
        { courseName: { $regex: escaped, $options: "i" } },
        { courseCode: { $regex: escaped, $options: "i" } },
      ];
    }

    const courses = await Course.find(filter)
      .sort({ courseCode: 1 })
      .limit(20)
      .lean();

    res.status(200).json({
      status: "success",
      data: courses,
    });
  } catch (error) {
    next(error);
  }
};

export const getAvailableSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department } = req.query;
    const filter: any = {};
    if (department && department !== "all") {
      filter.department = normalizeDepartment(department as string);
    }
    const distinctSessions = await Course.distinct("session", filter);
    let cleanSessions = distinctSessions.filter(Boolean);
    if (cleanSessions.length === 0) {
      cleanSessions = ["2021-22"];
    } else if (!cleanSessions.includes("2021-22")) {
      cleanSessions.unshift("2021-22");
    }
    res.status(200).json({
      status: "success",
      data: cleanSessions,
    });
  } catch (error) {
    next(error);
  }
};

export function isDuTechUnitAffiliated(inst?: string): boolean {
  if (!inst) return true;
  const lower = inst.toLowerCase().trim();
  return (
    lower.includes("mymensingh") ||
    lower.includes("mec") ||
    lower.includes("dhaka") ||
    lower.includes("technology unit") ||
    lower.includes("faridpur") ||
    lower.includes("fec") ||
    lower.includes("barishal") ||
    lower.includes("bec") ||
    lower.includes("niter") ||
    lower.includes("nittr") ||
    lower.includes("shyamoli") ||
    lower.includes("shaymoli")
  );
}

export async function getEffectiveCoursesForSession({
  department,
  session,
  semester,
  includeDiscontinued = false,
  status = "approved",
}: {
  department: string;
  session?: string;
  semester?: number;
  includeDiscontinued?: boolean;
  status?: string;
}) {
  const normDept = normalizeDepartment(department);
  const targetSession =
    session && session.trim() && session !== "default" && session !== "all"
      ? session.trim()
      : "2021-22";

  // 1. Fetch baseline courses (session: "2021-22" or legacy "default")
  const baselineFilter: any = {
    department: normDept,
    session: { $in: ["2021-22", "2021-2022", "default"] },
  };
  if (status && status !== "all") {
    baselineFilter.status = status;
  }
  const baselineCourses = await Course.find(baselineFilter)
    .populate("submittedBy", "fullName studentId email")
    .populate("reviewedBy", "fullName email")
    .lean();

  if (targetSession === "2021-22" || targetSession === "default") {
    let result = baselineCourses.map((c) => ({
      ...c,
      isBaseline: true,
      deltaId: null,
    }));
    if (semester && semester >= 1 && semester <= 8) {
      result = result.filter((c) => c.semester === semester);
    }
    return result.sort(
      (a, b) =>
        (a.semester || 0) - (b.semester || 0) || a.courseCode.localeCompare(b.courseCode)
    );
  }

  // 2. Fetch delta courses for targetSession
  const deltaFilter: any = {
    department: normDept,
    session: targetSession,
  };
  if (status && status !== "all") {
    deltaFilter.status = status;
  }
  const deltaCourses = await Course.find(deltaFilter)
    .populate("submittedBy", "fullName studentId email")
    .populate("reviewedBy", "fullName email")
    .lean();

  const replacedBaselineMap = new Map<string, any>();
  const deltaAdditions: any[] = [];
  const deltaReplacements: any[] = [];
  const deltaShuffles = new Map<string, any>();
  const deltaReductions = new Map<string, any>();

  for (const delta of deltaCourses) {
    const code = delta.courseCode.toUpperCase();
    if (delta.changeType === "replace" && delta.replacesCourseCode) {
      const repCode = delta.replacesCourseCode.toUpperCase();
      replacedBaselineMap.set(repCode, delta);
      deltaReplacements.push(delta);
    } else if (delta.changeType === "shuffle") {
      deltaShuffles.set(code, delta);
    } else if (delta.changeType === "reduction" || delta.isDiscontinued) {
      deltaReductions.set(code, delta);
    } else if (delta.changeType === "addition") {
      deltaAdditions.push(delta);
    } else {
      deltaAdditions.push(delta);
    }
  }

  let effectiveCourses: any[] = [];

  for (const base of baselineCourses) {
    const code = base.courseCode.toUpperCase();

    // Replaced
    if (replacedBaselineMap.has(code)) {
      if (includeDiscontinued) {
        const repDelta = replacedBaselineMap.get(code);
        effectiveCourses.push({
          ...base,
          isBaseline: false,
          isReplaced: true,
          replacedByCourseCode: repDelta.courseCode,
          deltaId: repDelta._id,
        });
      }
      continue;
    }

    // Reduced / Discontinued
    if (deltaReductions.has(code)) {
      const redDelta = deltaReductions.get(code);
      if (includeDiscontinued) {
        effectiveCourses.push({
          ...base,
          isBaseline: false,
          changeType: "reduction",
          isDiscontinued: true,
          deltaId: redDelta._id,
        });
      }
      continue;
    }

    // Shuffled
    if (deltaShuffles.has(code)) {
      const shufDelta = deltaShuffles.get(code);
      effectiveCourses.push({
        ...base,
        semester: shufDelta.semester,
        shuffledFromSemester: shufDelta.shuffledFromSemester || base.semester,
        changeType: "shuffle",
        isBaseline: false,
        deltaId: shufDelta._id,
      });
      continue;
    }

    // Untouched Baseline
    effectiveCourses.push({
      ...base,
      isBaseline: true,
      deltaId: null,
    });
  }

  // Add Replacements
  for (const rep of deltaReplacements) {
    effectiveCourses.push({
      ...rep,
      isBaseline: false,
      deltaId: rep._id,
      changeType: "replace",
    });
  }

  // Add Additions
  for (const add of deltaAdditions) {
    effectiveCourses.push({
      ...add,
      isBaseline: false,
      deltaId: add._id,
      changeType: "addition",
    });
  }

  if (semester && semester >= 1 && semester <= 8) {
    effectiveCourses = effectiveCourses.filter((c) => c.semester === semester);
  }

  return effectiveCourses.sort(
    (a, b) =>
      (a.semester || 0) - (b.semester || 0) || a.courseCode.localeCompare(b.courseCode)
  );
}

export const getCoursesBySemester = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department, semester, session, institute } = req.query;

    if (!department || !semester) {
      return res.status(400).json({
        status: "fail",
        message: "Department and semester are required.",
      });
    }

    const normalizedDept = normalizeDepartment(department as string);
    const semNum = parseInt(semester as string, 10);

    if (isNaN(semNum) || semNum < 1 || semNum > 8) {
      return res.status(400).json({
        status: "fail",
        message: "Semester must be a valid number between 1 and 8.",
      });
    }

    const sess = typeof session === "string" && session.trim() ? session.trim() : "2021-22";
    const instStr = typeof institute === "string" ? institute.trim() : "";
    const isDuTech = isDuTechUnitAffiliated(instStr);

    // If an institute is explicitly specified and is NOT a DU Tech Unit affiliated college
    if (instStr && !isDuTech) {
      const courses = await Course.find({
        department: normalizedDept,
        semester: semNum,
        institute: { $regex: new RegExp(`^${escapeRegex(instStr)}$`, "i") },
        status: "approved",
      })
        .sort({ courseCode: 1 })
        .lean();

      return res.status(200).json({
        status: "success",
        count: courses.length,
        data: courses,
      });
    }

    // DU Technology Unit: use delta resolution overlay
    const effectiveCourses = await getEffectiveCoursesForSession({
      department: normalizedDept,
      session: sess,
      semester: semNum,
      includeDiscontinued: false,
      status: "approved",
    });

    res.status(200).json({
      status: "success",
      count: effectiveCourses.length,
      data: effectiveCourses,
    });
  } catch (error) {
    next(error);
  }
};

export const submitCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      courseName,
      courseCode,
      courseCredit,
      department,
      semester,
      session,
      isElective,
      institute,
      changeType: reqChangeType,
      replacesCourseCode,
    } = req.body;

    if (!courseCode?.trim()) {
      return res.status(400).json({
        status: "fail",
        message: "Course code is required.",
      });
    }

    const cleanName = courseName?.trim() || courseCode.trim().toUpperCase();
    const normalizedDept = normalizeDepartment(department);
    const cleanCode = courseCode.trim().toUpperCase();
    const cleanSession = session && typeof session === "string" && session.trim() ? session.trim() : "2021-22";
    const semNum = semester ? parseInt(semester, 10) : undefined;
    const cleanInstitute =
      institute?.trim() ||
      (isDuTechUnitAffiliated(institute)
        ? "University of Dhaka (Technology Unit)"
        : institute?.trim() || "University of Dhaka (Technology Unit)");

    const finalChangeType =
      reqChangeType || (cleanSession !== "2021-22" && cleanSession !== "default" ? "addition" : "none");

    // Check if courseCode already exists for this department, session and institute
    const existing = await Course.findOne({
      courseCode: { $regex: new RegExp(`^${escapeRegex(cleanCode)}$`, "i") },
      department: normalizedDept,
      session: cleanSession,
      institute: cleanInstitute,
    });

    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "Course already exists in records for this session.",
        data: existing,
        isDuplicate: true,
      });
    }

    const isAdmin = (req as any).user && ["admin", "moderator"].includes((req as any).user.role);
    const initialStatus = isAdmin && req.body.status ? req.body.status : "pending";

    const newCourse = await Course.create({
      courseName: cleanName,
      courseCode: cleanCode,
      courseCredit: courseCredit ? courseCredit.trim() : "",
      department: normalizedDept,
      institute: cleanInstitute,
      semester: !isNaN(semNum as number) ? semNum : undefined,
      session: cleanSession,
      isElective: Boolean(isElective),
      changeType: finalChangeType,
      replacesCourseCode: replacesCourseCode ? replacesCourseCode.trim().toUpperCase() : null,
      status: initialStatus,
      submittedBy: (req as any).user?.id || null,
      reviewedBy: isAdmin && initialStatus === "approved" ? (req as any).user?.id : null,
    });

    res.status(201).json({
      status: "success",
      message: initialStatus === "approved" ? "Course created and approved." : "Course submitted for review.",
      data: newCourse,
      isDuplicate: false,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(200).json({
        status: "success",
        message: "Course already exists.",
        isDuplicate: true,
      });
    }
    next(error);
  }
};

export const getAllCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department, status, search, semester, session, page = "1", limit = "100" } = req.query;

    const normDept = department && department !== "all" ? normalizeDepartment(department as string) : undefined;
    const targetSession = session && session !== "all" ? (session as string).trim() : undefined;

    // If viewing an evolved session for a specific department, resolve effective courses with delta overlay
    if (normDept && targetSession && targetSession !== "2021-22" && targetSession !== "default") {
      let effectiveCourses = await getEffectiveCoursesForSession({
        department: normDept,
        session: targetSession,
        semester: semester && semester !== "all" ? parseInt(semester as string, 10) : undefined,
        includeDiscontinued: true,
        status: status && status !== "all" ? (status as string) : "all",
      });

      if (search && typeof search === "string" && search.trim()) {
        const q = search.trim().toLowerCase();
        effectiveCourses = effectiveCourses.filter(
          (c) =>
            c.courseName.toLowerCase().includes(q) ||
            c.courseCode.toLowerCase().includes(q)
        );
      }

      const distinctSessions = await Course.distinct("session", { department: normDept });
      let cleanSessions = distinctSessions.filter(Boolean);
      if (!cleanSessions.includes("2021-22")) cleanSessions.unshift("2021-22");
      if (!cleanSessions.includes(targetSession)) cleanSessions.push(targetSession);

      const approvedCount = effectiveCourses.filter(
        (c) => c.status === "approved" && !c.isDiscontinued && !c.isReplaced
      ).length;
      const pendingCount = effectiveCourses.filter((c) => c.status === "pending").length;

      return res.status(200).json({
        status: "success",
        data: effectiveCourses,
        sessions: cleanSessions,
        pagination: {
          page: 1,
          limit: effectiveCourses.length,
          total: effectiveCourses.length,
          totalPages: 1,
        },
        counts: {
          pending: pendingCount,
          approved: approvedCount,
          total: effectiveCourses.length,
        },
      });
    }

    const filter: any = {};
    if (normDept) {
      filter.department = normDept;
    }
    if (status && status !== "all") {
      filter.status = status;
    }
    if (semester && semester !== "all") {
      const s = parseInt(semester as string, 10);
      if (!isNaN(s)) filter.semester = s;
    }
    if (targetSession) {
      filter.session = targetSession;
    }
    if (search && typeof search === "string" && search.trim()) {
      const escaped = escapeRegex(search.trim());
      filter.$or = [
        { courseName: { $regex: escaped, $options: "i" } },
        { courseCode: { $regex: escaped, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const deptFilter: any = {};
    if (filter.department) deptFilter.department = filter.department;

    const [courses, total, pendingCount, approvedCount, distinctSessions] = await Promise.all([
      Course.find(filter)
        .populate("submittedBy", "fullName studentId email")
        .populate("reviewedBy", "fullName email")
        .sort({ semester: 1, courseCode: 1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Course.countDocuments(filter),
      Course.countDocuments({ ...deptFilter, status: "pending" }),
      Course.countDocuments({ ...deptFilter, status: "approved" }),
      Course.distinct("session", deptFilter),
    ]);

    let cleanSessions = distinctSessions.filter(Boolean);
    if (!cleanSessions.includes("2021-22")) cleanSessions.unshift("2021-22");

    const mappedCourses = courses.map((c) => ({
      ...c,
      isBaseline: !c.session || c.session === "2021-22" || c.session === "default",
    }));

    res.status(200).json({
      status: "success",
      data: mappedCourses,
      sessions: cleanSessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        total: pendingCount + approvedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deltaShuffleCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseCode, department, session, newSemester } = req.body;
    if (!courseCode || !department || !session || !newSemester) {
      return res.status(400).json({ status: "fail", message: "Missing required fields" });
    }
    const normDept = normalizeDepartment(department);
    const targetSession = (session as string).trim();
    const semNum = parseInt(newSemester, 10);

    if (isNaN(semNum) || semNum < 1 || semNum > 8) {
      return res.status(400).json({ status: "fail", message: "Invalid semester number (1-8)" });
    }

    if (targetSession === "2021-22" || targetSession === "default") {
      const updated = await Course.findOneAndUpdate(
        { courseCode: courseCode.trim().toUpperCase(), department: normDept, session: { $in: ["2021-22", "default"] } },
        { semester: semNum },
        { new: true }
      );
      return res.status(200).json({
        status: "success",
        data: updated,
        message: `Course semester updated to ${semNum} in baseline syllabus`,
      });
    }

    const baseline = await Course.findOne({
      courseCode: courseCode.trim().toUpperCase(),
      department: normDept,
      session: { $in: ["2021-22", "default"] },
    });

    if (!baseline) {
      return res.status(404).json({ status: "fail", message: "Baseline course not found" });
    }

    const delta = await Course.findOneAndUpdate(
      { courseCode: baseline.courseCode, department: normDept, session: targetSession },
      {
        courseName: baseline.courseName,
        courseCode: baseline.courseCode,
        courseCredit: baseline.courseCredit,
        department: normDept,
        institute: baseline.institute,
        semester: semNum,
        session: targetSession,
        isElective: baseline.isElective,
        changeType: "shuffle",
        shuffledFromSemester: baseline.semester,
        isDiscontinued: false,
        status: "approved",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: "success",
      message: `Course ${courseCode} shuffled to Semester ${semNum} in session ${targetSession}`,
      data: delta,
    });
  } catch (error) {
    next(error);
  }
};

export const deltaReplaceCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      oldCourseCode,
      newCourseCode,
      newCourseName,
      newCourseCredit,
      semester,
      session,
      department,
      isElective,
    } = req.body;

    if (!oldCourseCode || !newCourseCode || !newCourseName || !department || !session) {
      return res.status(400).json({ status: "fail", message: "Missing required fields" });
    }

    const normDept = normalizeDepartment(department);
    const targetSession = (session as string).trim();
    const semNum = semester ? parseInt(semester, 10) : undefined;

    const delta = await Course.findOneAndUpdate(
      { courseCode: newCourseCode.trim().toUpperCase(), department: normDept, session: targetSession },
      {
        courseName: newCourseName.trim(),
        courseCode: newCourseCode.trim().toUpperCase(),
        courseCredit: newCourseCredit ? newCourseCredit.trim() : "",
        department: normDept,
        semester: semNum,
        session: targetSession,
        isElective: Boolean(isElective),
        changeType: "replace",
        replacesCourseCode: oldCourseCode.trim().toUpperCase(),
        isDiscontinued: false,
        status: "approved",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: "success",
      message: `Course ${oldCourseCode} replaced by ${newCourseCode} in session ${targetSession}`,
      data: delta,
    });
  } catch (error) {
    next(error);
  }
};

export const deltaReduceCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseCode, department, session } = req.body;
    if (!courseCode || !department || !session) {
      return res.status(400).json({ status: "fail", message: "Missing required fields" });
    }

    const normDept = normalizeDepartment(department);
    const targetSession = (session as string).trim();

    const baseline = await Course.findOne({
      courseCode: courseCode.trim().toUpperCase(),
      department: normDept,
      session: { $in: ["2021-22", "default"] },
    });

    const delta = await Course.findOneAndUpdate(
      { courseCode: courseCode.trim().toUpperCase(), department: normDept, session: targetSession },
      {
        courseName: baseline?.courseName || courseCode,
        courseCode: courseCode.trim().toUpperCase(),
        courseCredit: baseline?.courseCredit || "",
        department: normDept,
        semester: baseline?.semester,
        session: targetSession,
        changeType: "reduction",
        isDiscontinued: true,
        status: "approved",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: "success",
      message: `Course ${courseCode} discontinued in session ${targetSession}`,
      data: delta,
    });
  } catch (error) {
    next(error);
  }
};

export const deltaRevertCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseCode, department, session, deltaId } = req.body;
    const normDept = department ? normalizeDepartment(department) : undefined;
    const targetSession = session ? (session as string).trim() : undefined;

    if (deltaId) {
      await Course.findByIdAndDelete(deltaId);
      return res.status(200).json({ status: "success", message: "Course change reverted to baseline" });
    }

    if (!courseCode || !normDept || !targetSession) {
      return res.status(400).json({ status: "fail", message: "Missing required fields" });
    }

    const cleanCode = courseCode.trim().toUpperCase();

    const deleted = await Course.findOneAndDelete({
      department: normDept,
      session: targetSession,
      $or: [
        { courseCode: cleanCode },
        { replacesCourseCode: cleanCode },
      ],
    });

    res.status(200).json({
      status: "success",
      message: `Course ${courseCode} change reverted to baseline in session ${targetSession}`,
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCourseStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "pending"].includes(status)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid status value. Must be 'approved' or 'pending'.",
      });
    }

    const updated = await Course.findByIdAndUpdate(
      id,
      {
        status,
        reviewedBy: (req as any).user?.id || null,
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        status: "fail",
        message: "Course not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: `Course status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { courseName, courseCode, courseCredit, department, semester, session, isElective, status } = req.body;

    const updateData: any = {};
    if (courseName) updateData.courseName = courseName.trim();
    if (courseCode) updateData.courseCode = courseCode.trim().toUpperCase();
    if (courseCredit !== undefined) updateData.courseCredit = courseCredit ? courseCredit.trim() : "";
    if (department) updateData.department = normalizeDepartment(department);
    if (semester !== undefined) {
      const s = parseInt(semester, 10);
      updateData.semester = !isNaN(s) ? s : null;
    }
    if (session !== undefined) updateData.session = session.trim();
    if (isElective !== undefined) updateData.isElective = Boolean(isElective);
    if (status) {
      updateData.status = status;
      if (status === "approved" && (req as any).user?.id) {
        updateData.reviewedBy = (req as any).user.id;
      }
    }

    const updated = await Course.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!updated) {
      return res.status(404).json({
        status: "fail",
        message: "Course not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Course updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: "fail",
        message: "Another course with this code already exists in this department.",
      });
    }
    next(error);
  }
};

export const deleteCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await Course.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        status: "fail",
        message: "Course not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Course deleted successfully.",
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
};
