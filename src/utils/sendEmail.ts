import nodemailer from "nodemailer";
import "../config/env";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface SendEmailOptions {
  to?: string | string[];
  bcc?: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: any[];
}

export async function sendEmail(
  toOrOptions: string | SendEmailOptions,
  subject?: string,
  html?: string,
  attachments?: any[]
) {
  if (typeof toOrOptions === "object" && toOrOptions !== null) {
    const opts = toOrOptions;
    const info = await transporter.sendMail({
      from: opts.from || process.env.EMAIL_FROM,
      to: opts.to || process.env.EMAIL_FROM,
      bcc: opts.bcc,
      cc: opts.cc,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    return info;
  }

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toOrOptions,
    subject: subject || "",
    html: html || "",
    attachments,
  });
  return info;
}

export const sendBccEmail = async (
  bccEmails: string[],
  subject: string,
  html: string,
  toEmail?: string,
  attachments?: any[]
) => {
  const primaryTo = toEmail || process.env.EMAIL_FROM || "no-reply@meccomputerclub.org";
  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < bccEmails.length; i += BATCH_SIZE) {
    const chunk = bccEmails.slice(i, i + BATCH_SIZE);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: primaryTo,
      bcc: chunk,
      subject,
      html,
      attachments,
    });
    results.push(info);
  }

  return results;
};
