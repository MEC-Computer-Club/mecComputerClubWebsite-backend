import { Request, Response, NextFunction } from "express";
import ContactMessage from "../models/ContactMessage.model";
import User from "../models/User.model";
import { sendEmail } from "../utils/sendEmail";
import { generateEmail } from "../utils/generateEmailTemplate";
import { createNotification } from "../services/notification.service";
import { getContactMessageEmailRecipients } from "./emailRouting.controller";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * @desc  Submit a contact message (public)
 * @route POST /api/contact-messages
 */
export const createContactMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const senderName = (req.body.senderName || req.body.name || "").trim();
    const senderEmail = (req.body.senderEmail || req.body.email || "").trim();
    const subject = (req.body.subject || "").trim();
    const body = (req.body.body || req.body.message || "").trim();

    if (!senderName || !senderEmail || !subject || !body) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const message = await ContactMessage.create({ senderName, senderEmail, subject, body });

    // Direct notifications to all admins, moderators, and executives to acknowledge and reply
    try {
      const staffUsers = await User.find({
        role: { $in: ["admin", "moderator", "executive"] },
      }).select("_id").lean();

      for (const recipientUser of staffUsers) {
        createNotification({
          recipient: recipientUser._id,
          type: "message",
          title: `New Message: ${subject}`,
          message: `${senderName} (${senderEmail}): "${body.length > 90 ? body.slice(0, 90) + '...' : body}"`,
          link: `/dashboard/messages?id=${message._id}`,
          actionLabel: "Acknowledge & Reply",
          priority: "high",
          metadata: { messageId: message._id, senderName, senderEmail },
        }).catch((err) => console.error("Staff notification error:", err));
      }
    } catch (notifErr) {
      console.error("Failed to dispatch contact message notifications:", notifErr);
    }

    // Dispatch email notifications to configured recipients
    try {
      const emailRecipients = await getContactMessageEmailRecipients();
      if (emailRecipients.length > 0) {
        const emailHtml = generateEmail("adminMailForContactMessage", {
          senderName,
          senderEmail,
          subject,
          message: body,
          link: `${FRONTEND_URL}/dashboard/messages?id=${message._id}`,
        });

        await sendEmail(
          emailRecipients.join(", "),
          `New Contact Inquiry: ${subject} - MEC CC`,
          emailHtml
        );
      }
    } catch (mailErr) {
      console.error("Failed to dispatch contact message email notification:", mailErr);
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get all contact messages (admin)
 * @route GET /api/contact-messages
 */
export const getContactMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === "true";
    }

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, data: messages, total, page, limit });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Get a single message by ID (admin)
 * @route GET /api/contact-messages/:id
 */
export const getContactMessageById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await ContactMessage.findById(req.params.id).lean();
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    res.status(200).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Mark a message as read (admin)
 * @route PATCH /api/contact-messages/:id/read
 */
export const markMessageRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    res.status(200).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Reply to a contact message — saves reply in DB and sends email
 * @route POST /api/contact-messages/:id/reply
 */
export const replyToMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: "Reply body is required." });
    }

    const adminId = (req as any).user?.id;
    const adminName = (req as any).user?.fullName || (req as any).user?.name || "Admin";

    const message = await ContactMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    // Save reply to DB
    const reply = {
      body: body.trim(),
      repliedBy: adminId,
      repliedByName: adminName,
      sentAt: new Date(),
    };
    message.replies.push(reply as any);
    message.isRead = true; // mark as read when replied
    await message.save();

    // Send reply email to the original sender
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">MEC Computer Club</h2>
          <p style="color: #bfdbfe; margin: 4px 0 0;">Reply to your message</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
          <p style="color: #374151; margin: 0 0 8px;">Hi <strong>${message.senderName}</strong>,</p>
          <p style="color: #374151; margin: 0 0 16px;">
            Thank you for reaching out. Here is our reply to your message:
          </p>
          <div style="background: white; border-left: 4px solid #1e40af; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
            <p style="color: #1f2937; margin: 0; white-space: pre-wrap;">${body.trim()}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">
            <strong>Your original message:</strong>
          </p>
          <p style="color: #9ca3af; font-size: 13px; margin: 0; white-space: pre-wrap;">${message.body}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Replied by <strong>${adminName}</strong> · MEC Computer Club<br/>
            If you have further questions, reply to this email or visit our website.
          </p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: message.senderEmail,
        subject: `Re: ${message.subject} — MEC Computer Club`,
        html: emailHtml,
        category: "official",
      });
    } catch (emailErr) {
      console.error("Failed to send reply email:", emailErr);
      // Don't fail the request — reply is saved, email is best-effort
    }

    // Return the updated message with the new reply
    const updated = await ContactMessage.findById(req.params.id).lean();
    res.status(200).json({
      success: true,
      message: "Reply sent and saved.",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Delete a contact message (admin)
 * @route DELETE /api/contact-messages/:id
 */
export const deleteContactMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    res.status(200).json({ success: true, message: "Message deleted successfully." });
  } catch (error) {
    next(error);
  }
};
