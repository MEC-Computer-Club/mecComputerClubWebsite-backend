import { Request, Response, NextFunction } from "express";
import Developer from "../models/Developer.model";

const DEFAULT_SEED_DEVELOPERS = [
  {
    id: "210347",
    name: "Md. Nasir Ahmed",
    role: "Lead Full-Stack Architect & Core Maintainer",
    department: "Department of CSE",
    batch: "5th Batch",
    session: "2021-2022",
    featuresWorkedOn: [
      {
        title: "Competitive Programming Hub",
        desc: "Automated Codeforces & AtCoder profile rating sync, live contest tracker, and collegiate leaderboard.",
      },
      {
        title: "Core System Architecture",
        desc: "Full-stack Next.js 15 App Router, Node.js, Express REST API layer, and MongoDB schema design.",
      },
      {
        title: "Dynamic Theme & Vibe Engine",
        desc: "Multi-color aesthetic system with synchronized vibe rotation, light/dark mode tokens, and state preservation.",
      },
      {
        title: "Auth & Security Permissions",
        desc: "Secure session management, JWT tokens, and fine-grained Role-Based Access Control (RBAC).",
      },
    ],
    profileUrl: "/profile/210347",
    github: "https://github.com/nasir-ahmed-dev",
    initials: "NA",
    avatarBg: "from-lime-500 via-emerald-500 to-teal-600",
    order: 1,
    isActive: true,
  },
  {
    id: "210311",
    name: "Tawhid Ahmed (Abokash)",
    role: "Core Frontend Developer & UI/UX Architect",
    department: "Department of CSE",
    batch: "5th Batch",
    session: "2021-2022",
    featuresWorkedOn: [
      {
        title: "Neo-Brutalist Design System",
        desc: "Club-wide design tokens, dynamic theme vibe color engine, and cohesive component library.",
      },
      {
        title: "Photo Sigil Watermark Studio",
        desc: "Client-side HTML5 Canvas engine for instant photo watermarking, logo overlays, and student media branding.",
      },
      {
        title: "Official Cover Page Generator",
        desc: "Automated vector A4 PDF cover page and lab report generation utility for engineering coursework.",
      },
      {
        title: "Responsive UI & Micro-Interactions",
        desc: "Mobile-first accessible component layouts, dynamic animations, and creative digital assets.",
      },
    ],
    profileUrl: "/profile/210311",
    github: "https://github.com/abokash",
    initials: "TA",
    avatarBg: "from-amber-500 via-orange-500 to-rose-600",
    order: 2,
    isActive: true,
  },
];

export const getDevelopers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let developers = await Developer.find({ isActive: true }).sort({ order: 1, createdAt: 1 });

    // Seed default developers if collection is empty
    if (!developers || developers.length === 0) {
      await Developer.insertMany(DEFAULT_SEED_DEVELOPERS);
      developers = await Developer.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    }

    return res.status(200).json(developers);
  } catch (error) {
    next(error);
  }
};

export const createDeveloper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      id,
      name,
      role,
      department,
      batch,
      session,
      featuresWorkedOn,
      profileUrl,
      github,
      initials,
      avatarBg,
      photo,
      order,
    } = req.body;

    if (!id || !name || !role) {
      return res.status(400).json({ message: "Student ID, Name, and Role are required." });
    }

    // Check if developer already exists
    const existing = await Developer.findOne({ id: id.trim() });
    if (existing) {
      // Re-activate and update if previously deactivated
      existing.name = name.trim();
      existing.role = role.trim();
      if (department !== undefined) existing.department = department;
      if (batch !== undefined) existing.batch = batch;
      if (session !== undefined) existing.session = session;
      if (featuresWorkedOn !== undefined) existing.featuresWorkedOn = featuresWorkedOn;
      if (profileUrl !== undefined) existing.profileUrl = profileUrl;
      if (github !== undefined) existing.github = github;
      if (initials !== undefined) existing.initials = initials;
      if (avatarBg !== undefined) existing.avatarBg = avatarBg;
      if (photo !== undefined) existing.photo = photo;
      if (order !== undefined) existing.order = order;
      existing.isActive = true;
      await existing.save();
      return res.status(200).json(existing);
    }

    const count = await Developer.countDocuments({ isActive: true });
    const newDev = await Developer.create({
      id: id.trim(),
      name: name.trim(),
      role: role.trim(),
      department: department || "Department of CSE",
      batch: batch || "5th Batch",
      session: session || "2021-2022",
      featuresWorkedOn: Array.isArray(featuresWorkedOn) ? featuresWorkedOn : [],
      profileUrl: profileUrl || `/profile/${id.trim()}`,
      github: github || "",
      initials: initials || name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
      avatarBg: avatarBg || "from-lime-500 via-emerald-500 to-teal-600",
      photo: photo || "",
      order: typeof order === "number" ? order : count + 1,
      isActive: true,
    });

    return res.status(201).json(newDev);
  } catch (error) {
    next(error);
  }
};

export const updateDeveloper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    const dev = await Developer.findOne({
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!dev) {
      return res.status(404).json({ message: "Developer not found." });
    }

    if (updateData.name) dev.name = updateData.name.trim();
    if (updateData.role) dev.role = updateData.role.trim();
    if (updateData.department !== undefined) dev.department = updateData.department;
    if (updateData.batch !== undefined) dev.batch = updateData.batch;
    if (updateData.session !== undefined) dev.session = updateData.session;
    if (updateData.featuresWorkedOn !== undefined) dev.featuresWorkedOn = updateData.featuresWorkedOn;
    if (updateData.profileUrl !== undefined) dev.profileUrl = updateData.profileUrl;
    if (updateData.github !== undefined) dev.github = updateData.github;
    if (updateData.initials !== undefined) dev.initials = updateData.initials;
    if (updateData.avatarBg !== undefined) dev.avatarBg = updateData.avatarBg;
    if (updateData.photo !== undefined) dev.photo = updateData.photo;
    if (updateData.order !== undefined) dev.order = updateData.order;
    if (updateData.isActive !== undefined) dev.isActive = updateData.isActive;

    await dev.save();
    return res.status(200).json(dev);
  } catch (error) {
    next(error);
  }
};

export const deleteDeveloper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const dev = await Developer.findOne({
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!dev) {
      return res.status(404).json({ message: "Developer not found." });
    }

    await Developer.deleteOne({ _id: dev._id });
    return res.status(200).json({ message: "Developer contributor removed successfully." });
  } catch (error) {
    next(error);
  }
};

export const reorderDevelopers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body; // Array of { id: string, order: number }
    if (!Array.isArray(orders)) {
      return res.status(400).json({ message: "Orders array is required." });
    }

    const updates = orders.map((item) =>
      Developer.updateOne({ id: item.id }, { $set: { order: item.order } })
    );
    await Promise.all(updates);

    const developers = await Developer.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    return res.status(200).json(developers);
  } catch (error) {
    next(error);
  }
};
