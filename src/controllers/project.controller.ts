import { Request, Response, NextFunction } from "express";
import { Project } from "../models/Project.model";
import User from "../models/User.model";

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "project"}-${Date.now().toString(36)}`;
}

export function parseRepositories(body: any): Array<{ label: string; url: string }> {
  const { githubRepositories, githubLinks, githubLink, repoUrl } = body;
  let reposList: Array<{ label: string; url: string }> = [];

  if (Array.isArray(githubRepositories) && githubRepositories.length > 0) {
    reposList = githubRepositories
      .filter((r: any) => r && typeof r.url === "string" && r.url.trim().length > 0)
      .map((r: any) => ({
        label: (r.label || "Repository").trim(),
        url: r.url.trim(),
      }));
  } else if (Array.isArray(githubLinks) && githubLinks.length > 0) {
    reposList = githubLinks
      .filter((u: any) => typeof u === "string" && u.trim().length > 0)
      .map((u: string, idx: number) => ({
        label: idx === 0 ? "Frontend / Main" : "Backend / Sub",
        url: u.trim(),
      }));
  } else if (githubLink || repoUrl) {
    const single = (githubLink || repoUrl).trim();
    if (single) {
      reposList = [{ label: "Main Repository", url: single }];
    }
  }

  return reposList;
}

export function resolveCoverImage(imageUrl?: string, liveUrl?: string, githubRepoUrl?: string): string {
  if (imageUrl && imageUrl.trim() && !imageUrl.includes("default.jpg")) {
    return imageUrl.trim();
  }
  const live = (liveUrl || "").trim();
  if (live && (live.startsWith("http://") || live.startsWith("https://"))) {
    return `https://s0.wp.com/mshots/v1/${encodeURIComponent(live)}?w=900`;
  }
  const repo = (githubRepoUrl || "").trim();
  const ghMatch = repo.match(/github\.com\/([^\/]+)\/([^\/\#\?]+)/i);
  if (ghMatch) {
    const owner = ghMatch[1];
    const repoName = ghMatch[2].replace(/\.git$/i, "");
    return `https://opengraph.githubassets.com/1/${owner}/${repoName}`;
  }
  return "";
}

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const userId = user?.id;
    const isAdmin = user?.role === "admin" || user?.role === "moderator";

    const {
      title,
      description,
      department,
      status,
      startDate,
      endDate,
      githubLink,
      repoUrl,
      liveDemoLink,
      liveUrl,
      requiredSkills,
      techStack,
      imageUrl,
      image,
      featured,
      teamMembers,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Project title and description are required" });
    }

    // Validate mandatory GitHub repository link
    const reposList = parseRepositories(req.body);
    if (reposList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one GitHub repository link is mandatory.",
      });
    }

    const primaryGithubLink = reposList[0].url;
    const resolvedLive = (liveDemoLink || liveUrl || "").trim();
    const finalImageUrl = resolveCoverImage(imageUrl || image, resolvedLive, primaryGithubLink);

    const skills = Array.isArray(requiredSkills) && requiredSkills.length > 0
      ? requiredSkills
      : Array.isArray(techStack) && techStack.length > 0
      ? techStack
      : typeof techStack === "string"
      ? techStack.split(",").map((s: string) => s.trim()).filter(Boolean)
      : typeof requiredSkills === "string"
      ? requiredSkills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    let memberIds = Array.isArray(teamMembers)
      ? teamMembers.map((m: any) => (typeof m === "object" && m?._id ? String(m._id) : String(m))).filter(Boolean)
      : typeof teamMembers === "string"
      ? teamMembers.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (!isAdmin && userId && !memberIds.includes(userId)) {
      memberIds.unshift(userId);
    } else if (isAdmin && memberIds.length === 0 && userId) {
      memberIds.push(userId);
    }

    const project = await Project.create({
      title: title.trim(),
      slug: generateSlug(title),
      description: description.trim(),
      department: department || "webdev",
      status: status || "in_progress",
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      githubLink: primaryGithubLink,
      githubRepositories: reposList,
      githubLinks: reposList.map((r) => r.url),
      liveDemoLink: resolvedLive,
      teamMembers: memberIds,
      createdBy: userId || undefined,
      requiredSkills: skills,
      techStack: skills,
      imageUrl: finalImageUrl,
      imagePublicId: req.body.imagePublicId || "",
      featured: isAdmin ? Boolean(featured) : false,
    });

    // Bi-directional synchronization: link project to each member's user profile
    if (memberIds.length > 0) {
      await User.updateMany(
        { _id: { $in: memberIds } },
        { $addToSet: { projectsContributed: project._id } }
      ).catch((err) => console.error("Error linking project to users:", err));
    }

    const populated = await Project.findById(project._id)
      .populate("teamMembers", "fullName imageUrl studentId department role email")
      .populate("createdBy", "fullName imageUrl studentId email");

    res.status(201).json({
      success: true,
      data: populated || project,
      message: "Project created successfully!",
    });
  } catch (error) {
    next(error);
  }
};

export const getMyProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const projects = await Project.find({
      $or: [{ teamMembers: userId }, { createdBy: userId }],
    })
      .populate("teamMembers", "fullName imageUrl studentId department role")
      .populate("createdBy", "fullName imageUrl studentId email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
};

export const proposeProject = async (req: Request, res: Response, next: NextFunction) => {
  return createProject(req, res, next);
};

export const getAllProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.featured !== undefined) {
      filter.featured = String(req.query.featured) === "true";
    }

    const projects = await Project.find(filter)
      .populate("teamMembers", "fullName imageUrl studentId department role email")
      .populate("createdBy", "fullName imageUrl studentId email")
      .sort({ featured: -1, createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("teamMembers", "fullName imageUrl studentId department role email")
      .populate("createdBy", "fullName imageUrl studentId email")
      .lean();
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
};

export const toggleFeaturedProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const newFeatured = req.body.featured !== undefined ? Boolean(req.body.featured) : !project.featured;
    if (newFeatured && !project.featured) {
      const featuredCount = await Project.countDocuments({ featured: true });
      if (featuredCount >= 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 projects can be featured on the Home page. Please unfeature an existing project first.",
        });
      }
    }

    project.featured = newFeatured;
    await project.save();

    const populated = await Project.findById(project._id)
      .populate("teamMembers", "fullName imageUrl studentId department role email")
      .populate("createdBy", "fullName imageUrl studentId email");

    res.status(200).json({
      success: true,
      data: populated || project,
      message: newFeatured ? "Project highlighted on Home page!" : "Project removed from Home highlights",
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const userId = user?.id;
    const isAdmin = user?.role === "admin" || user?.role === "moderator";

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const isCreator = project.createdBy && project.createdBy.toString() === userId;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    const updates = { ...req.body };
    // Only admins can modify the featured status
    if (!isAdmin) {
      delete updates.featured;
    } else if (updates.featured && !project.featured) {
      const featuredCount = await Project.countDocuments({ featured: true });
      if (featuredCount >= 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 projects can be featured on the Home page. Please unfeature an existing project first.",
        });
      }
    }

    if (updates.githubRepositories !== undefined || updates.githubLinks !== undefined || updates.githubLink !== undefined || updates.repoUrl !== undefined) {
      const reposList = parseRepositories(updates);
      if (reposList.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one GitHub repository link is mandatory.",
        });
      }
      updates.githubRepositories = reposList;
      updates.githubLinks = reposList.map((r) => r.url);
      updates.githubLink = reposList[0].url;
    }

    if (updates.liveDemoLink === undefined && updates.liveUrl !== undefined) {
      updates.liveDemoLink = updates.liveUrl;
    }

    const activeLive = (updates.liveDemoLink !== undefined ? updates.liveDemoLink : project.liveDemoLink) || "";
    const activeRepo = (updates.githubLink !== undefined ? updates.githubLink : project.githubLink) || "";

    if (updates.imageUrl !== undefined || updates.image !== undefined) {
      const explicitImg = (updates.imageUrl !== undefined ? updates.imageUrl : updates.image) || "";
      updates.imageUrl = resolveCoverImage(explicitImg, activeLive, activeRepo);
    } else if (!project.imageUrl) {
      const autoImg = resolveCoverImage("", activeLive, activeRepo);
      if (autoImg) {
        updates.imageUrl = autoImg;
      }
    }

    if (updates.techStack !== undefined || updates.requiredSkills !== undefined) {
      const skills = Array.isArray(updates.techStack)
        ? updates.techStack
        : Array.isArray(updates.requiredSkills)
        ? updates.requiredSkills
        : typeof updates.techStack === "string"
        ? updates.techStack.split(",").map((s: string) => s.trim()).filter(Boolean)
        : typeof updates.requiredSkills === "string"
        ? updates.requiredSkills.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      updates.techStack = skills;
      updates.requiredSkills = skills;
    }

    let newMemberIds: string[] | undefined;
    if (updates.teamMembers !== undefined) {
      newMemberIds = Array.isArray(updates.teamMembers)
        ? updates.teamMembers.map((m: any) => (typeof m === "object" && m?._id ? String(m._id) : String(m))).filter(Boolean)
        : typeof updates.teamMembers === "string"
        ? updates.teamMembers.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      updates.teamMembers = newMemberIds;
    }

    const previousMemberIds = (project.teamMembers || []).map((id) => id.toString());

    const updated = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("teamMembers", "fullName imageUrl studentId department role email")
      .populate("createdBy", "fullName imageUrl studentId email");

    // Sync member changes with User model
    if (newMemberIds !== undefined) {
      const addedMembers = newMemberIds.filter((id) => !previousMemberIds.includes(id));
      const removedMembers = previousMemberIds.filter((id) => !newMemberIds!.includes(id));

      if (addedMembers.length > 0) {
        await User.updateMany(
          { _id: { $in: addedMembers } },
          { $addToSet: { projectsContributed: project._id } }
        ).catch(() => {});
      }
      if (removedMembers.length > 0) {
        await User.updateMany(
          { _id: { $in: removedMembers } },
          { $pull: { projectsContributed: project._id } }
        ).catch(() => {});
      }
    }

    res.status(200).json({ success: true, data: updated, message: "Project updated successfully" });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const userId = user?.id;
    const isAdmin = user?.role === "admin" || user?.role === "moderator";

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const isCreator = project.createdBy && project.createdBy.toString() === userId;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }

    await Project.findByIdAndDelete(req.params.id);

    // Unlink project from all users' projectsContributed
    await User.updateMany(
      { projectsContributed: project._id },
      { $pull: { projectsContributed: project._id } }
    ).catch(() => {});

    res.status(200).json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    next(error);
  }
};
