import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import QuestionArchive, { IQuestionArchive } from "../models/QuestionArchive.model";
import Course from "../models/Course.model";
import { deleteFromCloudinary } from "../services/upload.service";
import { normalizeDepartment } from "./course.controller";

/**
 * Helper to delete a file from either Cloudinary or local disk
 */
const cleanupFile = async (filePublicId?: string, fileUrl?: string) => {
  if (filePublicId) {
    try {
      if (
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_CLOUD_NAME !== "your_cloudinary_cloud_name"
      ) {
        await deleteFromCloudinary(filePublicId);
        return;
      }
    } catch {
      // ignore
    }
  }

  // If local file path
  if (fileUrl && fileUrl.startsWith("/public/uploads/")) {
    try {
      const relative = fileUrl.replace(/^\/public\//, "");
      const fullPath = path.join(process.cwd(), "public", relative);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.warn("Failed to delete local question file:", err);
    }
  }
};

/**
 * Detect file type category from mimetype or file extension
 */
const detectFileType = (mimeType?: string, fileName?: string): "pdf" | "image" | "document" => {
  const ext = fileName ? path.extname(fileName).toLowerCase() : "";
  if (
    (mimeType && mimeType.startsWith("image/")) ||
    [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"].includes(ext)
  ) {
    return "image";
  }
  if (mimeType === "application/pdf" || ext === ".pdf") {
    return "pdf";
  }
  return "document";
};

/**
 * @desc Get all archived questions with rich filtering and pagination
 * @route GET /api/questions
 * @access Public
 */
export const getQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      department,
      semester,
      year,
      session,
      examType,
      courseCode,
      fileType,
      search,
      status,
      page = "1",
      limit = "12",
      sortBy = "year",
      sortOrder = "desc",
    } = req.query;

    const filter: any = {};

    // Filter by status (public sees published only, admins can query all)
    if (status && typeof status === "string" && status !== "all") {
      filter.status = status;
    } else {
      filter.status = "published";
    }

    if (department && department !== "all") {
      filter.department = (department as string).trim().toUpperCase();
    }

    if (semester && semester !== "all") {
      const semNum = parseInt(semester as string, 10);
      if (!isNaN(semNum)) filter.semester = semNum;
    }

    if (year && year !== "all") {
      const yearNum = parseInt(year as string, 10);
      if (!isNaN(yearNum)) filter.year = yearNum;
    }

    if (session && session !== "all") {
      filter.session = (session as string).trim();
    }

    if (examType && examType !== "all") {
      filter.examType = { $regex: new RegExp(`^${(examType as string).trim()}$`, "i") };
    }

    if (fileType && fileType !== "all") {
      filter.fileType = (fileType as string).trim();
    }

    if (courseCode && courseCode !== "all") {
      filter.courseCode = { $regex: new RegExp((courseCode as string).trim(), "i") };
    }

    if (search && typeof search === "string" && search.trim()) {
      const query = search.trim();
      const escaped = query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      filter.$or = [
        { title: regex },
        { courseCode: regex },
        { courseName: regex },
        { department: regex },
        { examType: regex },
        { description: regex },
        { tags: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortObj: any = {};
    const order = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "year") {
      sortObj.year = order;
      sortObj.semester = 1;
      sortObj.courseCode = 1;
    } else if (sortBy === "semester") {
      sortObj.semester = order;
      sortObj.year = -1;
    } else if (sortBy === "views") {
      sortObj.viewCount = order;
    } else if (sortBy === "downloads") {
      sortObj.downloadCount = order;
    } else if (sortBy === "courseCode") {
      sortObj.courseCode = order;
      sortObj.year = -1;
    } else {
      sortObj.createdAt = order;
    }

    const [questions, total] = await Promise.all([
      QuestionArchive.find(filter)
        .populate("uploadedBy", "fullName studentId email role")
        .populate("course", "courseCode courseName courseCredit department semester")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      QuestionArchive.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: questions.length,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      data: questions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get dynamic filter options for Questions Archive (never hardcoded, admin created)
 * @route GET /api/questions/filters
 * @access Public
 */
export const getQuestionFilters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department } = req.query;

    // Fetch distinct values from QuestionArchive
    const [archiveDepts, archiveYears, archiveSemesters, archiveExamTypes, archiveFileTypes] =
      await Promise.all([
        QuestionArchive.distinct("department"),
        QuestionArchive.distinct("year"),
        QuestionArchive.distinct("semester"),
        QuestionArchive.distinct("examType"),
        QuestionArchive.distinct("fileType"),
      ]);

    // Also fetch distinct departments from Course collection
    const courseDepts = await Course.distinct("department");

    // Dynamic distinct departments: merges all existing stored departments
    const mergedDepts = Array.from(
      new Set(
        [...archiveDepts, ...courseDepts, "CSE", "EEE", "CE"]
          .filter(Boolean)
          .map((d) => (d as string).trim().toUpperCase())
      )
    ).sort();

    // Distinct years (descending)
    let years = (archiveYears as number[]).filter(Boolean).sort((a, b) => b - a);
    if (years.length === 0) {
      const currentYear = new Date().getFullYear();
      years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
    } else {
      const currentYear = new Date().getFullYear();
      if (!years.includes(currentYear)) {
        years.unshift(currentYear);
        years.sort((a, b) => b - a);
      }
    }

    // Semesters: All dynamically created ones plus 1 to 8 as standard baseline
    const semesters = Array.from(
      new Set([...(archiveSemesters as number[]), 1, 2, 3, 4, 5, 6, 7, 8].filter(Boolean))
    ).sort((a, b) => a - b);

    // Exam types: All dynamically created ones plus standard options
    const standardTypes = ["Semester Final", "CT1", "CT2", "CT3", "Midterm", "Lab Final", "Quiz"];
    const examTypes = Array.from(
      new Set(
        [...standardTypes, ...archiveExamTypes.filter(Boolean)].map((t) => (t as string).trim())
      )
    );

    // Available file types
    const fileTypes = Array.from(
      new Set(["all", "pdf", "image", ...archiveFileTypes.filter(Boolean)])
    );

    // Optional list of courses for dynamic auto-suggest
    const courseFilter: any = { status: "approved" };
    if (department && department !== "all") {
      courseFilter.department = (department as string).trim().toUpperCase();
    }

    const courses = await Course.find(courseFilter)
      .select("courseCode courseName department semester courseCredit")
      .sort({ courseCode: 1 })
      .lean();

    // Aggregated stats
    const [totalQuestions, totalPdfs, totalImages] = await Promise.all([
      QuestionArchive.countDocuments({ status: "published" }),
      QuestionArchive.countDocuments({ status: "published", fileType: "pdf" }),
      QuestionArchive.countDocuments({ status: "published", fileType: "image" }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        departments: mergedDepts,
        years,
        semesters,
        examTypes,
        fileTypes,
        courses,
        stats: {
          totalQuestions,
          totalPdfs,
          totalImages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get single question by ID and increment view count
 * @route GET /api/questions/:id
 * @access Public
 */
export const getQuestionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const question = await QuestionArchive.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate("uploadedBy", "fullName studentId email role")
      .populate("course", "courseCode courseName courseCredit department semester");

    if (!question) {
      return res.status(404).json({ success: false, message: "Question paper not found" });
    }

    res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Track download count and return download URL
 * @route POST /api/questions/:id/download
 * @access Public
 */
export const downloadQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const question = await QuestionArchive.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    ).select("fileUrl fileName title courseCode year examType fileType");

    if (!question) {
      return res.status(404).json({ success: false, message: "Question paper not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        fileUrl: question.fileUrl,
        fileName:
          question.fileName ||
          `${question.courseCode}_${question.year}_${question.examType}.${
            question.fileType === "image" ? "png" : "pdf"
          }`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Create/upload a new question paper (supports PDF and images)
 * @route POST /api/questions
 * @access Private (Admin, Moderator, Executive)
 */
export const createQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      department,
      semester,
      year,
      session,
      examType,
      courseCode,
      courseName,
      description,
      tags,
      status = "published",
    } = req.body;

    if (!department) {
      return res.status(400).json({ success: false, message: "Department is required" });
    }
    if (!semester) {
      return res.status(400).json({ success: false, message: "Semester is required" });
    }
    if (!year) {
      return res.status(400).json({ success: false, message: "Exam year is required" });
    }
    if (!examType) {
      return res.status(400).json({ success: false, message: "Exam type is required" });
    }
    if (!courseCode) {
      return res.status(400).json({ success: false, message: "Course code is required" });
    }
    if (!courseName) {
      return res.status(400).json({ success: false, message: "Course name is required" });
    }

    let fileUrl = "";
    let filePublicId = "";
    let fileName = "";
    let fileSize = 0;
    let mimeType = "application/pdf";
    let fileType: "pdf" | "image" | "document" = "pdf";

    if (req.file) {
      const file = req.file as any;
      if (file.path && file.path.startsWith("http")) {
        // Cloudinary storage
        fileUrl = file.secure_url || file.path;
        filePublicId = file.filename || file.public_id || "";
      } else {
        // Disk storage
        fileUrl = `/public/uploads/questions/${file.filename}`;
        filePublicId = file.filename;
      }
      fileName = file.originalname;
      fileSize = file.size;
      mimeType = file.mimetype || "application/pdf";
      fileType = detectFileType(mimeType, fileName);
    } else if (req.body.fileUrl) {
      fileUrl = req.body.fileUrl;
      filePublicId = req.body.filePublicId || "";
      fileName = req.body.fileName || "exam-question";
      fileSize = req.body.fileSize || 0;
      mimeType = req.body.mimeType || "application/pdf";
      fileType = req.body.fileType || detectFileType(mimeType, fileName);
    } else {
      return res.status(400).json({
        success: false,
        message: "Question document or image file is required",
      });
    }

    // Auto-generate title if empty
    const normalizedDept = (department as string).trim().toUpperCase();
    const cleanCourseCode = courseCode.trim().toUpperCase();
    const cleanExamType = examType.trim();
    const cleanYear = parseInt(year, 10);
    const cleanSemester = parseInt(semester, 10);

    const generatedTitle =
      title && title.trim()
        ? title.trim()
        : `${cleanCourseCode} - ${cleanExamType} (${cleanYear})`;

    // Check if course exists in Course database
    const matchingCourse = await Course.findOne({
      courseCode: { $regex: new RegExp(`^${cleanCourseCode}$`, "i") },
      department: normalizedDept,
    }).select("_id");

    // Process tags
    let processedTags: string[] = [];
    if (Array.isArray(tags)) {
      processedTags = tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof tags === "string" && tags.trim()) {
      processedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    const question = await QuestionArchive.create({
      title: generatedTitle,
      department: normalizedDept,
      semester: cleanSemester,
      year: cleanYear,
      session: session ? session.trim() : "",
      examType: cleanExamType,
      courseCode: cleanCourseCode,
      courseName: courseName.trim(),
      course: matchingCourse?._id || null,
      fileUrl,
      filePublicId,
      fileName,
      fileSize,
      fileType,
      mimeType,
      description: description ? description.trim() : "",
      tags: processedTags,
      status,
      uploadedBy: (req as any).user?.id || (req as any).user?._id,
    });

    const populated = await QuestionArchive.findById(question._id)
      .populate("uploadedBy", "fullName studentId email role")
      .populate("course", "courseCode courseName department semester");

    res.status(201).json({
      success: true,
      message: "Question paper archived successfully",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Update an existing question paper (can update metadata or replace file)
 * @route PATCH /api/questions/:id
 * @access Private (Admin, Moderator, Executive)
 */
export const updateQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const question = await QuestionArchive.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question paper not found" });
    }

    const {
      title,
      department,
      semester,
      year,
      session,
      examType,
      courseCode,
      courseName,
      description,
      tags,
      status,
    } = req.body;

    if (department) question.department = (department as string).trim().toUpperCase();
    if (semester) question.semester = parseInt(semester, 10);
    if (year) question.year = parseInt(year, 10);
    if (session !== undefined) question.session = session.trim();
    if (examType) question.examType = examType.trim();
    if (courseCode) question.courseCode = courseCode.trim().toUpperCase();
    if (courseName) question.courseName = courseName.trim();
    if (description !== undefined) question.description = description.trim();
    if (status) question.status = status;

    if (title && title.trim()) {
      question.title = title.trim();
    } else if (courseCode || examType || year) {
      question.title = `${question.courseCode} - ${question.examType} (${question.year})`;
    }

    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        question.tags = tags.map((t) => String(t).trim()).filter(Boolean);
      } else if (typeof tags === "string") {
        question.tags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    // Check if new file was uploaded (PDF or Image)
    if (req.file) {
      // Remove old file
      await cleanupFile(question.filePublicId, question.fileUrl);

      const file = req.file as any;
      if (file.path && file.path.startsWith("http")) {
        question.fileUrl = file.secure_url || file.path;
        question.filePublicId = file.filename || file.public_id || "";
      } else {
        question.fileUrl = `/public/uploads/questions/${file.filename}`;
        question.filePublicId = file.filename;
      }
      question.fileName = file.originalname;
      question.fileSize = file.size;
      question.mimeType = file.mimetype || "application/pdf";
      question.fileType = detectFileType(question.mimeType, question.fileName);
    }

    // Update course reference if course code changed
    if (courseCode || department) {
      const matchingCourse = await Course.findOne({
        courseCode: { $regex: new RegExp(`^${question.courseCode}$`, "i") },
        department: question.department,
      }).select("_id");
      question.course = matchingCourse?._id || null;
    }

    await question.save();

    const populated = await QuestionArchive.findById(question._id)
      .populate("uploadedBy", "fullName studentId email role")
      .populate("course", "courseCode courseName department semester");

    res.status(200).json({
      success: true,
      message: "Question paper updated successfully",
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete a question paper
 * @route DELETE /api/questions/:id
 * @access Private (Admin, Moderator, Executive)
 */
export const deleteQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const question = await QuestionArchive.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question paper not found" });
    }

    // Cleanup stored file
    await cleanupFile(question.filePublicId, question.fileUrl);

    await question.deleteOne();

    res.status(200).json({
      success: true,
      message: "Question paper deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
