import { Request, Response } from "express";
import SiteSetting from "../models/SiteSetting.model";
import { generateEmail, EmailType } from "../utils/generateEmailTemplate";
import { sendEmail } from "../utils/sendEmail";

export interface TemplateMeta {
  key: EmailType;
  title: string;
  category: "authentication" | "membership" | "invitations" | "administrative";
  description: string;
  defaultSubject: string;
  variables: { name: string; description: string; sample: string }[];
}

export const TEMPLATES_CATALOG: TemplateMeta[] = [
  {
    key: "emailVerification",
    title: "Email Verification Code",
    category: "authentication",
    description: "Dispatched upon registration to confirm student email authenticity via a 6-digit OTP code.",
    defaultSubject: "Email Verification - MEC Computer Club",
    variables: [
      { name: "userName", description: "Recipient's full name", sample: "Tanvir Rahman" },
      { name: "code", description: "6-digit OTP verification code", sample: "849201" },
      { name: "link", description: "Direct one-click verification URL", sample: "https://meccomputerclub.org/verify?code=849201" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "passwordReset",
    title: "Password Reset & Recovery",
    category: "authentication",
    description: "Sent when a club member or staff requests a secure password recovery code.",
    defaultSubject: "Reset Password - MEC Computer Club",
    variables: [
      { name: "userName", description: "Recipient's full name", sample: "Tanvir Rahman" },
      { name: "code", description: "6-digit reset security code", sample: "512934" },
      { name: "link", description: "Direct password reset URL", sample: "https://meccomputerclub.org/reset-password?token=sample" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "invitation",
    title: "Official Invitation Code",
    category: "invitations",
    description: "Sent to newly invited executives, advisors, or VIP alumni with their exclusive invitation code.",
    defaultSubject: "Invitation Code - MEC Computer Club",
    variables: [
      { name: "userName", description: "Invited person's name", sample: "Md. Nasir Ahmed" },
      { name: "code", description: "Alpha-numeric invitation code", sample: "EXEC-2026-VIP" },
      { name: "link", description: "Registration link with code pre-filled", sample: "https://meccomputerclub.org/register?code=EXEC-2026-VIP" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "status",
    title: "Membership Approval Notice",
    category: "membership",
    description: "Celebratory email dispatched when a student's pending membership application is approved.",
    defaultSubject: "Registration Status - MEC Computer Club",
    variables: [
      { name: "userName", description: "Member's full name", sample: "Tanvir Rahman" },
      { name: "status", description: "Approval decision text", sample: "Approved" },
      { name: "dashboardLink", description: "Direct link to member dashboard", sample: "https://meccomputerclub.org/dashboard" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "rejection",
    title: "Application Rejection / Update",
    category: "membership",
    description: "Respectful notice sent when an applicant is not selected during a recruitment cycle.",
    defaultSubject: "Update Regarding Your Application - MEC Computer Club",
    variables: [
      { name: "userName", description: "Applicant's full name", sample: "Candidate" },
      { name: "contactLink", description: "Club support contact page", sample: "https://meccomputerclub.org/contact-us" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "adminMailForMemberRegistration",
    title: "Admin Review Notification",
    category: "administrative",
    description: "Dispatched to club executives/moderators when a new applicant submits their membership form.",
    defaultSubject: "Review New Member Registration - MEC Computer Club",
    variables: [
      { name: "userName", description: "Applicant's full name", sample: "Salman Haider" },
      { name: "studentId", description: "MEC College Roll / ID", sample: "220347" },
      { name: "department", description: "Academic Department", sample: "CSE" },
      { name: "batch", description: "Department Batch", sample: "11th Batch" },
      { name: "email", description: "Applicant's email address", sample: "salman@example.com" },
      { name: "link", description: "Direct admin review link", sample: "https://meccomputerclub.org/dashboard/members" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
];

// Generate realistic mock sample data for template preview
export function getSampleDataForTemplate(key: EmailType) {
  return {
    userName: "Md. Nasir Ahmed",
    code: "849201",
    link: "https://meccomputerclub.org/verify?token=sample_token_demo",
    dashboardLink: "https://meccomputerclub.org/dashboard",
    contactLink: "https://meccomputerclub.org/contact-us",
    status: "Approved" as const,
    clubName: "MEC Computer Club",
    department: "CSE",
    batch: "8th Batch",
    session: "2019-20",
    studentId: "190101",
    contactNumber: "+8801712345678",
    registrationDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    userImageUrl: "https://res.cloudinary.com/dj1sjgitq/image/upload/v1768389923/uploads/club_logo/email_banner_lxbsq9.png",
    email: "applicant@mec.ac.bd",
  };
}

/**
 * GET /api/email-templates
 * Returns catalog of all templates with current customized or default HTML
 */
export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    const customizedDocs = await SiteSetting.find({
      key: { $regex: /^email_tpl_/ },
    }).lean();

    const customMap = new Map<string, { html: string; subject?: string }>();
    customizedDocs.forEach((doc) => {
      try {
        const parsed = JSON.parse(doc.value);
        customMap.set(doc.key.replace("email_tpl_", ""), parsed);
      } catch {
        customMap.set(doc.key.replace("email_tpl_", ""), { html: doc.value });
      }
    });

    const templates = TEMPLATES_CATALOG.map((item) => {
      const custom = customMap.get(item.key);
      const isCustomized = Boolean(custom && custom.html);
      const html = isCustomized ? custom!.html : generateEmail(item.key, getSampleDataForTemplate(item.key));
      const subject = (custom && custom.subject) || item.defaultSubject;

      return {
        ...item,
        isCustomized,
        subject,
        html,
      };
    });

    return res.status(200).json({ success: true, data: templates });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load email templates" });
  }
};

/**
 * GET /api/email-templates/:key
 * Returns specific template details & preview HTML
 */
export const getTemplateByKey = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    if (!meta) {
      return res.status(404).json({ success: false, message: "Template key not found" });
    }

    const doc = await SiteSetting.findOne({ key: `email_tpl_${key}` }).lean();
    let isCustomized = false;
    let html = "";
    let subject = meta.defaultSubject;

    if (doc && doc.value) {
      isCustomized = true;
      try {
        const parsed = JSON.parse(doc.value);
        html = parsed.html || doc.value;
        subject = parsed.subject || meta.defaultSubject;
      } catch {
        html = doc.value;
      }
    } else {
      html = generateEmail(meta.key, getSampleDataForTemplate(meta.key));
    }

    return res.status(200).json({
      success: true,
      data: {
        ...meta,
        isCustomized,
        subject,
        html,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load template" });
  }
};

/**
 * PUT /api/email-templates/:key
 * Save customized HTML and subject line
 */
export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { html, subject } = req.body;

    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    if (!meta) {
      return res.status(404).json({ success: false, message: "Template key not found" });
    }

    if (!html || !html.trim()) {
      return res.status(400).json({ success: false, message: "Template HTML cannot be empty" });
    }

    const payload = JSON.stringify({
      html: html.trim(),
      subject: subject?.trim() || meta.defaultSubject,
      updatedAt: new Date().toISOString(),
    });

    await SiteSetting.findOneAndUpdate(
      { key: `email_tpl_${key}` },
      {
        key: `email_tpl_${key}`,
        value: payload,
        label: `Email Template: ${meta.title}`,
        description: `Customized HTML template for ${meta.title}`,
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Template "${meta.title}" updated successfully`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to update template" });
  }
};

/**
 * POST /api/email-templates/:key/reset
 * Reset template to code default
 */
export const resetTemplate = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    await SiteSetting.findOneAndDelete({ key: `email_tpl_${key}` });

    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    const defaultHtml = meta ? generateEmail(meta.key, getSampleDataForTemplate(meta.key)) : "";

    return res.status(200).json({
      success: true,
      message: "Template restored to original default",
      html: defaultHtml,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to reset template" });
  }
};

/**
 * POST /api/email-templates/test-send
 * Dispatches test email to administrator inbox with sample values
 */
export const sendTestEmail = async (req: Request, res: Response) => {
  try {
    const { key, recipientEmail, html: customHtml, subject: customSubject } = req.body;

    if (!recipientEmail || !recipientEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "A valid recipient email is required" });
    }

    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    const subject = customSubject || meta?.defaultSubject || "Test Email - MEC Computer Club";

    let htmlToSend = customHtml;
    if (!htmlToSend) {
      if (meta) {
        htmlToSend = generateEmail(meta.key, getSampleDataForTemplate(meta.key));
      } else {
        htmlToSend = "<p>Test email from MEC Computer Club Administration</p>";
      }
    }

    await sendEmail(recipientEmail, `[TEST] ${subject}`, htmlToSend);

    return res.status(200).json({
      success: true,
      message: `Test email dispatched successfully to ${recipientEmail}`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send test email. Please check SMTP settings.",
    });
  }
};
