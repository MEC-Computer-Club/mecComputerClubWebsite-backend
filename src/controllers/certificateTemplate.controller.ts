import { Request, Response, NextFunction } from "express";
import { CertificateTemplate } from "../models/CertificateTemplate.model";

// Default standard template seed helper
const ensureDefaultTemplateExists = async () => {
  const count = await CertificateTemplate.countDocuments();
  if (count === 0) {
    await CertificateTemplate.create({
      name: "MEC Computer Club Standard Official (Emerald)",
      description: "Official club green theme with brutalist borders and dual signatures.",
      type: "visual",
      theme: "emerald-clean",
      badgeIcon: "award",
      primaryColor: "#0D9488",
      accentColor: "#F59E0B",
      borderStyle: "neo-brutalist",
      headerSubtitle: "MYMENSINGH ENGINEERING COLLEGE COMPUTER CLUB",
      titleText: "Certificate of Excellence",
      presentationText: "PROUDLY PRESENTED TO",
      signatories: [
        { name: "Executive Committee", title: "MEC Computer Club" },
        { name: "Faculty Advisor", title: "Mymensingh Engineering College" },
      ],
      footerNote: "Official credential verified on the MEC Computer Club registry.",
      isDefault: true,
    });
  }
};

/**
 * @desc  List all certificate templates
 * @route GET /api/certificate-templates
 * @access Public / Authenticated
 */
export const listTemplates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDefaultTemplateExists();

    const { search, type, eventId } = req.query;
    const query: any = {};

    if (search && typeof search === "string" && search.trim() !== "") {
      query.name = { $regex: search.trim(), $options: "i" };
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (eventId) {
      query.$or = [{ associatedEvent: eventId }, { associatedEvent: null }, { associatedEvent: { $exists: false } }];
    }

    const templates = await CertificateTemplate.find(query)
      .populate("associatedEvent", "title slug date")
      .populate("createdBy", "fullName email")
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();

    res.status(200).json({ success: true, count: templates.length, data: templates });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get template by ID
 * @route GET /api/certificate-templates/:id
 * @access Public
 */
export const getTemplateById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const template = await CertificateTemplate.findById(id)
      .populate("associatedEvent", "title slug date")
      .populate("createdBy", "fullName email");

    if (!template) {
      return res.status(404).json({ success: false, message: "Certificate template not found." });
    }

    res.status(200).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Create a certificate template (admin/executive)
 * @route POST /api/certificate-templates
 * @access Admin/Executive
 */
export const createTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    const {
      name,
      description,
      type = "visual",
      htmlContent,
      theme,
      backgroundUrl,
      badgeIcon,
      primaryColor,
      accentColor,
      borderStyle,
      headerSubtitle,
      titleText,
      presentationText,
      signatories,
      footerNote,
      isDefault,
      associatedEvent,
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Template name is required." });
    }

    if (type === "html" && (!htmlContent || htmlContent.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "HTML content is required for custom HTML template mode.",
      });
    }

    // If marked as default, unset any previous default
    if (isDefault) {
      await CertificateTemplate.updateMany({}, { isDefault: false });
    }

    const newTemplate = await CertificateTemplate.create({
      name: name.trim(),
      description: description?.trim(),
      type,
      htmlContent: htmlContent || "",
      theme: theme || "emerald-clean",
      backgroundUrl: backgroundUrl?.trim() || "",
      badgeIcon: badgeIcon || "award",
      primaryColor: primaryColor || "#0D9488",
      accentColor: accentColor || "#F59E0B",
      borderStyle: borderStyle || "neo-brutalist",
      headerSubtitle: headerSubtitle?.trim() || "MYMENSINGH ENGINEERING COLLEGE COMPUTER CLUB",
      titleText: titleText?.trim() || "Certificate of Excellence",
      presentationText: presentationText?.trim() || "PROUDLY PRESENTED TO",
      signatories: Array.isArray(signatories) && signatories.length > 0
        ? signatories
        : [
            { name: "Executive Committee", title: "MEC Computer Club" },
            { name: "Faculty Advisor", title: "Mymensingh Engineering College" },
          ],
      footerNote: footerNote?.trim() || "Official credential verified on the MEC Computer Club registry.",
      isDefault: Boolean(isDefault),
      associatedEvent: associatedEvent || undefined,
      createdBy: adminId || undefined,
    });

    res.status(201).json({
      success: true,
      message: "Certificate template created successfully.",
      data: newTemplate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Update a certificate template (admin/executive)
 * @route PUT /api/certificate-templates/:id
 * @access Admin/Executive
 */
export const updateTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      htmlContent,
      theme,
      backgroundUrl,
      badgeIcon,
      primaryColor,
      accentColor,
      borderStyle,
      headerSubtitle,
      titleText,
      presentationText,
      signatories,
      footerNote,
      isDefault,
      associatedEvent,
    } = req.body;

    const template = await CertificateTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Certificate template not found." });
    }

    if (name) template.name = name.trim();
    if (description !== undefined) template.description = description?.trim();
    if (type) template.type = type;
    if (htmlContent !== undefined) template.htmlContent = htmlContent;
    if (theme) template.theme = theme;
    if (backgroundUrl !== undefined) template.backgroundUrl = backgroundUrl?.trim();
    if (badgeIcon) template.badgeIcon = badgeIcon;
    if (primaryColor) template.primaryColor = primaryColor;
    if (accentColor) template.accentColor = accentColor;
    if (borderStyle) template.borderStyle = borderStyle;
    if (headerSubtitle !== undefined) template.headerSubtitle = headerSubtitle?.trim();
    if (titleText !== undefined) template.titleText = titleText?.trim();
    if (presentationText !== undefined) template.presentationText = presentationText?.trim();
    if (Array.isArray(signatories)) template.signatories = signatories;
    if (footerNote !== undefined) template.footerNote = footerNote?.trim();
    if (associatedEvent !== undefined) template.associatedEvent = associatedEvent || undefined;

    if (isDefault !== undefined && isDefault !== template.isDefault) {
      if (isDefault) {
        await CertificateTemplate.updateMany({ _id: { $ne: id } }, { isDefault: false });
      }
      template.isDefault = Boolean(isDefault);
    }

    await template.save();

    res.status(200).json({
      success: true,
      message: "Certificate template updated successfully.",
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Delete a certificate template (admin)
 * @route DELETE /api/certificate-templates/:id
 * @access Admin
 */
export const deleteTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const template = await CertificateTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Certificate template not found." });
    }

    if (template.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the default certificate template. Please set another template as default first.",
      });
    }

    await CertificateTemplate.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Certificate template deleted successfully." });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Set template as default
 * @route PATCH /api/certificate-templates/:id/default
 * @access Admin
 */
export const setDefaultTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const template = await CertificateTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: "Certificate template not found." });
    }

    await CertificateTemplate.updateMany({}, { isDefault: false });
    template.isDefault = true;
    await template.save();

    res.status(200).json({
      success: true,
      message: `"${template.name}" is now the default certificate template.`,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};
