import { Request, Response, NextFunction } from "express";
import { Sponsor } from "../models/Sponsor.model";
import { uploadToCloudinary } from "../services/upload.service";

export const createSponsor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let logoUrl = req.body.logoUrl;
    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      logoUrl = result.url;
    }
    const {
      name,
      website,
      isActive,
      showOnHome,
      contactName,
      contactEmail,
      sponsorships,
      category,
      role,
      tier,
      description,
      startDate,
      endDate,
    } = req.body;

    const sponsor = await Sponsor.create({
      name,
      website,
      isActive: isActive !== undefined ? (isActive === "true" || isActive === true) : true,
      showOnHome: showOnHome !== undefined ? (showOnHome === "true" || showOnHome === true) : false,
      contactName,
      contactEmail,
      logoUrl,
      category: category || "sponsor",
      role: role || "",
      tier: tier || "",
      description: description || "",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sponsorships: typeof sponsorships === "string" ? JSON.parse(sponsorships) : (sponsorships || []),
    });
    res.status(201).json({ success: true, data: sponsor });
  } catch (error) { next(error); }
};

const sanitizeSponsorForPublic = (s: any) => {
  const { contactName, contactEmail, contactPhone, notes, amountOrValue, ...rest } = s;
  if (Array.isArray(rest.sponsorships)) {
    rest.sponsorships = rest.sponsorships.map((rec: any) => {
      const { amountOrValue, notes: recNotes, ...recRest } = rec;
      return recRest;
    });
  }
  return rest;
};

export const getAllSponsors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.active === "true") filter.isActive = true;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.showOnHome === "true") filter.showOnHome = true;

    const userRole = (req as any).user?.role;
    const isStaff = userRole === "admin" || userRole === "moderator";

    // Public users should only see active sponsors unless explicitly requesting
    if (!isStaff && req.query.active === undefined) {
      filter.isActive = true;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 20);
    const isAll = req.query.all === "true";

    const total = await Sponsor.countDocuments(filter);
    const totalPages = isAll ? 1 : (Math.ceil(total / limit) || 1);

    let query = Sponsor.find(filter).sort({ createdAt: -1 });
    if (!isAll) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const sponsors = await query.lean();
    const data = isStaff ? sponsors : sponsors.map(sanitizeSponsorForPublic);

    res.status(200).json({
      success: true,
      data,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
        hasNextPage: isAll ? false : page < totalPages,
        hasPrevPage: isAll ? false : page > 1,
      },
    });
  } catch (error) { next(error); }
};

export const getSponsorById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sponsor = await Sponsor.findById(req.params.id).lean();
    if (!sponsor) return res.status(404).json({ success: false, message: "Sponsor not found" });

    const userRole = (req as any).user?.role;
    const isStaff = userRole === "admin" || userRole === "moderator";
    const data = isStaff ? sponsor : sanitizeSponsorForPublic(sponsor);

    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const updateSponsor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, any> = { ...req.body };
    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      update.logoUrl = result.url;
    }
    if (update.isActive !== undefined) {
      update.isActive = update.isActive === "true" || update.isActive === true;
    }
    if (update.showOnHome !== undefined) {
      update.showOnHome = update.showOnHome === "true" || update.showOnHome === true;
    }
    if (typeof update.sponsorships === "string") {
      update.sponsorships = JSON.parse(update.sponsorships);
    }
    const sponsor = await Sponsor.findByIdAndUpdate(req.params.id, update, {
      new: true, runValidators: true,
    });
    if (!sponsor) return res.status(404).json({ success: false, message: "Sponsor not found" });
    res.status(200).json({ success: true, data: sponsor });
  } catch (error) { next(error); }
};

export const addSponsorshipRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sponsor = await Sponsor.findByIdAndUpdate(
      req.params.id,
      { $push: { sponsorships: req.body } },
      { new: true, runValidators: true }
    );
    if (!sponsor) return res.status(404).json({ success: false, message: "Sponsor not found" });
    res.status(200).json({ success: true, data: sponsor });
  } catch (error) { next(error); }
};

export const deleteSponsor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sponsor = await Sponsor.findByIdAndDelete(req.params.id);
    if (!sponsor) return res.status(404).json({ success: false, message: "Sponsor not found" });
    res.status(200).json({ success: true, message: "Sponsor deleted" });
  } catch (error) { next(error); }
};
