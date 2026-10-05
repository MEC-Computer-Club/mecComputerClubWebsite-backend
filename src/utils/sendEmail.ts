import nodemailer from "nodemailer";
import "../config/env";

export type EmailCategory = "noreply" | "official";

// Helper to create a dedicated nodemailer transporter
function createSmtpTransporter(
  host?: string,
  port?: string | number,
  user?: string,
  pass?: string
) {
  if (!host || !user || !pass) {
    return null;
  }
  const numericPort = Number(port || 587);
  return nodemailer.createTransport({
    host,
    port: numericPort,
    secure: numericPort === 465,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
}

// 1. System / No-Reply Transporter
const noReplyHost = process.env.SMTP_NOREPLY_HOST || process.env.SMTP_HOST;
const noReplyPort = process.env.SMTP_NOREPLY_PORT || process.env.SMTP_PORT || 587;
const noReplyUser = process.env.SMTP_NOREPLY_USER || process.env.SMTP_USER;
const noReplyPass = process.env.SMTP_NOREPLY_PASS || process.env.SMTP_PASS;

const noReplyTransporter = createSmtpTransporter(
  noReplyHost,
  noReplyPort,
  noReplyUser,
  noReplyPass
);

// 2. Official Communications Transporter
const officialHost = process.env.SMTP_OFFICIAL_HOST || process.env.SMTP_HOST;
const officialPort = process.env.SMTP_OFFICIAL_PORT || process.env.SMTP_PORT || 587;
const officialUser = process.env.SMTP_OFFICIAL_USER;
const officialPass = process.env.SMTP_OFFICIAL_PASS;

const officialTransporter = createSmtpTransporter(
  officialHost,
  officialPort,
  officialUser,
  officialPass
);

// Resolve which transporter and defaults to use based on category
function getMailDispatcher(category: EmailCategory = "noreply") {
  const defaultNoReplyFrom =
    process.env.EMAIL_FROM_NOREPLY ||
    process.env.EMAIL_FROM ||
    (noReplyUser ? `MEC Computer Club <${noReplyUser}>` : "MEC Computer Club <no-reply@meccomputerclub.org>");

  const defaultOfficialFrom =
    process.env.EMAIL_FROM_OFFICIAL ||
    (officialUser ? `MEC Computer Club <${officialUser}>` : "MEC Computer Club <official@meccomputerclub.org>");

  if (category === "official") {
    // If dedicated official SMTP is configured, use it directly
    if (officialTransporter) {
      return {
        transporter: officialTransporter,
        from: defaultOfficialFrom,
        replyTo: process.env.EMAIL_REPLY_TO_OFFICIAL || officialUser || "official@meccomputerclub.org",
      };
    }

    // Otherwise, fall back to no-reply transporter with official From and Reply-To
    return {
      transporter: noReplyTransporter,
      from: defaultOfficialFrom,
      replyTo: process.env.EMAIL_REPLY_TO_OFFICIAL || "official@meccomputerclub.org",
    };
  }

  // "noreply" category (default)
  return {
    transporter: noReplyTransporter,
    from: defaultNoReplyFrom,
    replyTo: undefined,
  };
}

export interface SendEmailOptions {
  to?: string | string[];
  bcc?: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  category?: EmailCategory;
  from?: string;
  replyTo?: string;
  attachments?: any[];
}

async function executeSendMail(
  mailOptions: nodemailer.SendMailOptions,
  category: EmailCategory = "noreply"
) {
  const dispatcher = getMailDispatcher(category);
  if (!dispatcher.transporter) {
    throw new Error(
      `SMTP is not configured for category "${category}". Please check your SMTP environment variables.`
    );
  }

  const finalMailOptions: nodemailer.SendMailOptions = {
    ...mailOptions,
    from: mailOptions.from || dispatcher.from,
    replyTo: mailOptions.replyTo || dispatcher.replyTo,
  };

  try {
    return await dispatcher.transporter.sendMail(finalMailOptions);
  } catch (err: any) {
    // If official SMTP failed (e.g. 535 auth error or network error) and no-reply is available, fall back automatically
    if (category === "official" && noReplyTransporter && dispatcher.transporter !== noReplyTransporter) {
      console.warn(
        `[SMTP Fallback] Official SMTP dispatch failed (${err?.message || "auth error"}). Falling back to primary transporter with official sender headers.`
      );
      return await noReplyTransporter.sendMail(finalMailOptions);
    }
    throw err;
  }
}

export async function sendEmail(
  toOrOptions: string | SendEmailOptions,
  subject?: string,
  html?: string,
  attachments?: any[],
  category: EmailCategory = "noreply"
) {
  if (typeof toOrOptions === "object" && toOrOptions !== null) {
    const opts = toOrOptions;
    const cat = opts.category || "noreply";
    return await executeSendMail(
      {
        from: opts.from,
        to: opts.to,
        bcc: opts.bcc,
        cc: opts.cc,
        replyTo: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments,
      },
      cat
    );
  }

  return await executeSendMail(
    {
      to: toOrOptions,
      subject: subject || "",
      html: html || "",
      attachments,
    },
    category
  );
}

export const sendBccEmail = async (
  bccEmails: string[],
  subject: string,
  html: string,
  toEmail?: string,
  attachments?: any[],
  category: EmailCategory = "official"
) => {
  const dispatcher = getMailDispatcher(category);
  const primaryTo = toEmail || dispatcher.from;
  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < bccEmails.length; i += BATCH_SIZE) {
    const chunk = bccEmails.slice(i, i + BATCH_SIZE);
    const info = await executeSendMail(
      {
        to: primaryTo,
        bcc: chunk,
        subject,
        html,
        attachments,
      },
      category
    );
    results.push(info);
  }

  return results;
};
