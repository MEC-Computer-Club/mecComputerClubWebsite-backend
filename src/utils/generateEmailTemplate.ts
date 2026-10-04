// src/services/emailTemplates.ts

export type StandardEmailType =
  | "invitation"
  | "rejection"
  | "passwordReset"
  | "emailVerification"
  | "status"
  | "adminMailForMemberRegistration"
  | "adminMailForContactMessage"
  | "loginSecurityCode"
  | "deviceBlocked"
  | "welcomeOnboard"
  | "roleAssignment"
  | "recruitmentDrive"
  | "eventInvitation"
  | "eventRegistrationConfirm"
  | "eventRecap"
  | "eventCertificate"
  | "facultyInvitation"
  | "sponsorProposal"
  | "sponsorThankYou"
  | "sponsorPostEvent"
  | "sponsorRenewal"
  | "sponsorInvoice"
  | "collabProposal"
  | "collabConfirmation"
  | "contactReplyMembership"
  | "contactReplyGeneral"
  | "contactReplySponsorship"
  | "contactReplyEvent"
  | "contactReplyFeedback"
  | "thankYouRecognition";

export type EmailType = StandardEmailType | (string & {});

export interface EmailData {
  userName?: string;
  code?: string;
  link?: string;
  expiresIn?: string;
  status?: "Approved" | "Rejected" | string;
  dashboardLink?: string;
  contactLink?: string;
  clubName?: string;
  extraMessage?: string;
  department?: string;
  batch?: string;
  session?: string;
  studentId?: string;
  contactNumber?: string;
  registrationDate?: string;
  userImageUrl?: string;
  email?: string;
  deviceInfo?: string;
  ipAddress?: string;
  remainingAttempts?: number;
  senderName?: string;
  senderEmail?: string;
  subject?: string;
  message?: string;
  // Extended fields for rich templates
  roleTitle?: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
  certificateUrl?: string;
  sponsorName?: string;
  tierName?: string;
  organizationName?: string;
  proposalLink?: string;
  replyMessage?: string;
  ctaText?: string;
  ctaUrl?: string;
  bodyHtml?: string;
  [key: string]: any;
}

function getStyle() {
  return `
  <style type="text/css">
      /* --- 1. FONTS & RESETS --- */
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Courier+Prime:wght@700&display=swap");

      body,
      table,
      td,
      a {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
      }
      table,
      td {
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
      }
      img {
        -ms-interpolation-mode: bicubic;
        border: 0;
        height: auto;
        line-height: 100%;
        outline: none;
        text-decoration: none;
        display: block;
      }
      table {
        border-collapse: collapse !important;
      }

      /* --- 2. BASE LAYOUT CLASSES --- */
      body {
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        font-family: "Inter", Helvetica, Arial, sans-serif;
        background-color: #f3f4f6;
        color: #333333;
      }

      .preheader {
        display: none;
        font-size: 1px;
        color: #fefefe;
        line-height: 1px;
        max-height: 0px;
        max-width: 0px;
        opacity: 0;
        overflow: hidden;
      }

      .main-wrapper {
        background-color: #f3f4f6;
        width: 100%;
      }

      .main-cell {
        padding: 40px 10px;
      }

      .card-container {
        max-width: 600px;
        width: 100%;
      }

      /* --- 3. CARD COMPONENT --- */
      .card {
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }

      .banner-img {
        width: 100%;
        max-width: 600px;
        height: auto;
        display: block;
      }

      .content-padding {
        padding: 40px 48px;
      }

      /* --- 4. TYPOGRAPHY --- */
      .header-text {
        margin: 0 0 16px;
        font-size: 26px;
        font-weight: 700;
        color: #002e5b;
        font-family: "Inter", sans-serif;
      }

      .body-text {
        margin: 0 0 24px;
        font-size: 16px;
        line-height: 1.6;
        color: #4b5563;
      }

      /* --- 5. OTP BOX COMPONENT --- */
      .otp-container {
        background-color: #fdf8f3;
        border: 2px dashed #f58a1f;
        border-radius: 12px;
        padding: 20px 0;
        width: 100%;
        max-width: 320px;
        text-align: center;
      }

      .otp-label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        color: #888888;
        margin-bottom: 5px;
        font-weight: 600;
      }

      .otp-value {
        font-family: "Courier Prime", "Courier New", monospace;
        font-size: 32px;
        font-weight: 700;
        letter-spacing: 8px;
        color: #002e5b;
      }

      /* --- 6. BUTTON COMPONENT --- */
      .btn-primary {
        background-color: #002e5b;
        border-radius: 8px;
        color: #ffffff;
        display: inline-block;
        font-family: "Inter", Helvetica, Arial, sans-serif;
        font-size: 16px;
        font-weight: 600;
        line-height: 54px;
        text-align: center;
        text-decoration: none;
        width: 100%;
        max-width: 260px;
        -webkit-text-size-adjust: none;
        box-shadow: 0 4px 6px rgba(0, 46, 91, 0.2);
      }

      /* --- 7. WARNING / EXPIRATION BOX --- */
      .warning-box {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: #6b7280;
        background-color: #f9fafb;
        padding: 8px 12px;
        border-radius: 6px;
        display: inline-block;
      }

      /* --- 8. FOOTER --- */
      .footer-cell {
        padding-top: 30px;
      }

      .footer-copy {
        margin: 0 0 10px;
        font-size: 14px;
        color: #9ca3af;
      }

      .footer-links-container {
        margin-top: 10px;
      }

      .footer-link {
        color: #002e5b;
        text-decoration: none;
        margin: 0 10px;
        font-size: 12px;
      }

      .footer-separator {
        color: #cccccc;
      }

      /* --- 9. MEDIA QUERIES (MOBILE) --- */
      @media screen and (max-width: 600px) {
        .email-container {
          width: 100% !important;
        }
        .content-padding {
          padding: 24px 20px !important;
        }
        .header-text {
          font-size: 24px !important;
        }
        .otp-value {
          font-size: 26px !important;
          letter-spacing: 6px !important;
        }
        .banner-img {
          border-radius: 12px 12px 0 0 !important;
        }
        .card {
          border-radius: 12px !important;
        }
      }

      /* --- 10. DARK MODE --- */
      @media (prefers-color-scheme: dark) {
        body,
        .main-wrapper {
          background-color: #121212 !important;
        }
        .card {
          background-color: #1e1e1e !important;
          border: 1px solid #333333 !important;
        }
        .header-text,
        .text-primary {
          color: #ffffff !important;
        }
        .body-text,
        .text-secondary {
          color: #b0b0b0 !important;
        }
        .otp-container {
          background-color: #2c2c2c !important;
          border: 1px solid #444444 !important;
        }
        .otp-value {
          color: #f58a1f !important;
        }
        .footer-copy {
          color: #666666 !important;
        }
        .btn-primary {
          background-color: #f58a1f !important;
          color: #002e5b !important;
        }
        .warning-box {
          background-color: #2c2c2c !important;
          color: #b0b0b0 !important;
        }
        .footer-link {
          color: #9ca3af !important;
        }
      }
    </style>`;
}

export interface EmailBrandingConfig {
  bannerUrl: string;
  clubName: string;
  institutionName?: string;
  footerAddress: string;
  footerNote: string;
  websiteUrl: string;
  contactUrl: string;
  primaryColor?: string;
  accentColor?: string;
}

export const DEFAULT_EMAIL_BRANDING: EmailBrandingConfig = {
  bannerUrl: "https://res.cloudinary.com/dj1sjgitq/image/upload/v1768389923/uploads/club_logo/email_banner_lxbsq9.png",
  clubName: "MEC Computer Club",
  institutionName: "Mymensingh Engineering College",
  footerAddress: "Mymensingh Engineering College, Mymensingh-2200",
  footerNote: "Official Notification System • Automated notification, please do not reply directly.",
  websiteUrl: "https://www.meccomputerclub.org/",
  contactUrl: "https://www.meccomputerclub.org/contact-us",
  primaryColor: "#002e5b",
  accentColor: "#f58a1f",
};

let activeBranding: EmailBrandingConfig = { ...DEFAULT_EMAIL_BRANDING };

export function setGlobalEmailBranding(branding: Partial<EmailBrandingConfig>) {
  activeBranding = { ...activeBranding, ...branding };
}

export function getGlobalEmailBranding(): EmailBrandingConfig {
  return activeBranding;
}

function getHeader(customBanner?: string, customAlt?: string) {
  const banner = customBanner || activeBranding.bannerUrl;
  const alt = customAlt || activeBranding.clubName;
  return `<table border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td width="100%">
          <img
            src="${banner}"
            alt="${alt}"
            class="banner-img"
          />
        </td>
      </tr>
    </table>`;
}

function getFooter(options?: {
  clubName?: string;
  footerAddress?: string;
  footerNote?: string;
  websiteUrl?: string;
  contactUrl?: string;
}) {
  const year = new Date().getFullYear();
  const clubName = options?.clubName || activeBranding.clubName;
  const address = options?.footerAddress || activeBranding.footerAddress;
  const note = options?.footerNote || activeBranding.footerNote;
  const website = options?.websiteUrl || activeBranding.websiteUrl;
  const contact = options?.contactUrl || activeBranding.contactUrl;

  return `<tr>
    <td align="center" class="footer-cell">
      <p class="footer-copy">
        &copy; ${year} ${clubName}.
        <br />
        ${address}
        ${note ? `<br /><span style="font-size: 11px; color: #9ca3af; margin-top: 4px; display: inline-block;">${note}</span>` : ""}
      </p>
      <div class="footer-links-container">
        <a href="${website}" class="footer-link">
          Website
        </a>
        <span class="footer-separator">|</span>
        <a href="${contact}" class="footer-link">
          Support &amp; Contact
        </a>
      </div>
    </td>
  </tr>`;
}

export interface GenericEmailOptions {
  title?: string;
  preheader?: string;
  greeting?: string;
  bodyHtml?: string;
  bodyParagraphs?: string[];
  ctaText?: string;
  ctaUrl?: string;
  secondaryActionText?: string;
  secondaryActionUrl?: string;
  otpCode?: string;
  otpLabel?: string;
  warningText?: string;
  detailsTable?: { label: string; value: string }[];
  footerNote?: string;
  bannerUrl?: string;
  clubName?: string;
}

export function generateGenericEmail(options: GenericEmailOptions): string {
  const clubName = options.clubName || activeBranding.clubName;
  const title = options.title || clubName;
  const preheader = options.preheader || title;
  const greeting = options.greeting || "Hi there,";
  const bannerUrl = options.bannerUrl || activeBranding.bannerUrl;

  let bodyContent = "";
  if (options.bodyHtml) {
    bodyContent = options.bodyHtml;
  } else if (options.bodyParagraphs && options.bodyParagraphs.length > 0) {
    bodyContent = options.bodyParagraphs
      .map((p) => `<p class="body-text">${p}</p>`)
      .join("\n");
  }

  // CTA button
  let ctaBlock = "";
  if (options.ctaText && options.ctaUrl) {
    ctaBlock = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 20px;">
        <tr>
          <td align="center">
            <a href="${options.ctaUrl}" target="_blank" class="btn-primary" style="display: inline-block; padding: 14px 32px; background-color: #f58a1f; color: #002e5b !important; text-decoration: none; font-weight: 700; border-radius: 8px; font-size: 15px; letter-spacing: 0.3px;">
              ${options.ctaText}
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  // OTP Block
  let otpBlock = "";
  if (options.otpCode) {
    otpBlock = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
        <tr>
          <td align="center">
            <div class="otp-container">
              <span class="otp-label">${options.otpLabel || "Your Code"}</span>
              <span class="otp-value">${options.otpCode}</span>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  // Details Table
  let tableBlock = "";
  if (options.detailsTable && options.detailsTable.length > 0) {
    const rows = options.detailsTable
      .map(
        (row) => `
      <tr>
        <td style="padding: 10px 14px; font-weight: 600; color: #002e5b; border-bottom: 1px solid #e5e7eb; width: 35%; font-size: 13px;">${row.label}</td>
        <td style="padding: 10px 14px; color: #4b5563; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${row.value}</td>
      </tr>
    `
      )
      .join("");
    tableBlock = `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        ${rows}
      </table>
    `;
  }

  // Warning text
  let warningBlock = "";
  if (options.warningText) {
    warningBlock = `
      <div class="warning-box" style="margin: 24px 0; padding: 14px 18px; background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 13px; color: #92400e; line-height: 1.5;">
        ${options.warningText}
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${title}</title>
    ${getStyle()}
  </head>
  <body>
    <div class="preheader">${preheader}</div>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td>
                <div class="card">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td width="100%">
                        <img src="${bannerUrl}" alt="${clubName}" class="banner-img" />
                      </td>
                    </tr>
                  </table>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td class="content-padding">
                        <h1 class="header-text">${title}</h1>
                        ${greeting ? `<p class="body-text" style="font-weight: 600; color: #002e5b;">${greeting}</p>` : ""}
                        ${bodyContent}
                        ${otpBlock}
                        ${tableBlock}
                        ${ctaBlock}
                        ${warningBlock}
                        ${options.footerNote ? `<p class="body-text" style="font-size: 13px; color: #6b7280; margin-top: 20px;">${options.footerNote}</p>` : ""}
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function wrapBodyInTemplate(
  bodyHtml: string,
  options?: {
    title?: string;
    preheader?: string;
    greeting?: string;
    bannerUrl?: string;
    clubName?: string;
    ctaText?: string;
    ctaUrl?: string;
  }
): string {
  return generateGenericEmail({
    title: options?.title || "Notice from MEC Computer Club",
    preheader: options?.preheader || options?.title || "MEC Computer Club Official Notice",
    greeting: options?.greeting || "Hi {{userName}},",
    bodyHtml,
    ctaText: options?.ctaText,
    ctaUrl: options?.ctaUrl,
    bannerUrl: options?.bannerUrl,
    clubName: options?.clubName || "MEC Computer Club",
  });
}

export function generateEmail(type: EmailType, data: EmailData) {
  const clubName = data.clubName || "MEC Computer Club";

  switch (type) {
    case "invitation":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Invitation Code - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Your MEC Computer Club invitation code is ${data.code}. Valid for 15 days.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Invitation Code for ${clubName}</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName ?? "Dear"},</strong> <br>
                       Great news! We've reviewed your application and are thrilled to welcome you to the
                        <strong>MEC Computer Club</strong> community! To make it official, we have generated an unique invitation code for you to create your account on our web portal.
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <div class="otp-container">
                              <span class="otp-label">Your Code</span>
                              <span class="otp-value">${data.code}</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <a href="${data.link ?? "#"}" target="_blank" class="btn-primary">
                              Go to Registration Page
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="warning-box">
                              ⏰ Valid for <strong>15 Days</strong> only.
                            </p>

                            <p class="body-text" style="text-align: left ; margin-top: 24px">We can't wait to see what you'll build with us!</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "rejection":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Update Regarding Your Application to MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Update Regarding Your Application to MEC Computer Club
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Update Regarding Your Application to MEC Computer Club</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName},</strong> <br>
                       Thank you for your interest in the
                        <strong>MEC Computer Club</strong> and for taking the time to apply for membership. We appreciate your enthusiasm.
                      </p>

                      <p class="body-text">
                        After careful review of all applications, we are unfortunately unable to move forward with your membership at this time. Due to the high volume of interest and limited capacity, the selection process was highly competitive.
                      </p>

                      <p class="body-text">
                        We encourage you to stay engaged with our club activities and feel free to apply again in the future. Your interest and enthusiasm are highly appreciated. 
                      </p>

                      <p class="body-text">
                      If you have any questions regarding the application process, please feel free to reach out to our administration team:
                        
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <a href="{{verification_link}}" target="_blank" class="btn-primary">
                              Contact Administration
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="body-text" style="text-align: left ; margin-top: 24px">We wish you the best of luck in your future endeavors!  </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "passwordReset":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Reset Password - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Your MEC Computer Club password reset code is ${data.code}. Valid for 30 minutes.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Password Reset Link - MEC Computer Club</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName},</strong> <br>
                        We received a request to reset your password for your account associated with this email address. You can use the code below to reset your password.
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <div class="otp-container">
                              <span class="otp-label">Your Code</span>
                              <span class="otp-value">${data.code}</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p class = "body-text">
                      Or you can click the button below to reset your password
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <a href="${data.link}" target="_blank" class="btn-primary">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="warning-box">
                              ⏰ Valid for <strong>30 minutes</strong> only.
                            </p>

                            <p class="body-text" style="text-align: left ; margin-top: 24px">If you did not request a password reset, please ignore this email.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "emailVerification":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Email Verification - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Your MEC Computer Club Email Verification code is ${data.code}. Valid for 30 minutes.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Email Verification Code for ${clubName}</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName},</strong> <br>
                        Thank you for registering with the <strong>MEC Computer Club</strong>. To complete your registration, please use the verification code below:
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <div class="otp-container">
                              <span class="otp-label">Your Code</span>
                              <span class="otp-value">${data.code}</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p class = "body-text">
                      Or you can click the button below to complete your registration
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px; color: #ffffff">
                            <a href="${data.link}" target="_blank" class="btn-primary">
                              Verify Email
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="warning-box">
                              ⏰ Valid for <strong>30 minutes</strong> only.
                            </p>

                            <p class="body-text" style="text-align: left ; margin-top: 24px">If you did not request an email verification, please ignore this email.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "status":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Registration Status - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Update Regarding Your Registration to MEC Computer Club.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Registration Status for ${clubName}</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName},</strong> <br>
                       We are delighted to inform you about the status of your registration with the
                        <strong>MEC Computer Club</strong>. After careful consideration, we decidede to ${
                          data.status
                        } your Registration. 
                      </p>

                      <p class="body-text">
                        Please visit the website to access your dashboard and explore the resources available to you.
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <a href="https://meccomputerclub.org" target="_blank" class="btn-primary">
                              Visit MEC Computer Club
                            </a>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="body-text" style="text-align: left ; margin-top: 24px">Stay focused on your goals and keep up the good work! </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "adminMailForMemberRegistration":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Review New Member Registration - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Review New Member Registration to MEC Computer Club.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Review New Member Registration</h1>

                      <p class="body-text">
                        <strong>Hi Admin,</strong> <br>
                        A new member has registered with the <strong>MEC Computer Club</strong>. Please review their application and take the necessary actions.
                      </p>

                      <div
                        style="
                          font-family: Arial, sans-serif;
                          max-width: 400px;
                          margin: 20px auto;
                          border: 1px solid #e0e0e0;
                          border-radius: 12px;
                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                          background-color: #ffffff;
                          overflow: hidden;
                        "
                      >
                        <div
                          style="
                            background-color: #004d99;
                            color: white;
                            padding: 15px 20px;
                            text-align: center;
                            border-top-left-radius: 12px;
                            border-top-right-radius: 12px;
                          "
                        >
                          
                          <p style="margin: 5px 0 0; font-size: 18px; font-weight: bold">New Member Info</p>
                        </div>

                        <div
                          style="
                            text-align: center;
                            padding: 10px 20px;
                            display: flex;
                            align-items: center;
                          "
                        >
                          <img
                            src=${data.userImageUrl}
                            alt="Member Photo"
                            style="
                              width: 100px;
                              height: 100px;
                              border-radius: 50%;
                              border: 3px solid #004d99;
                              object-fit: cover;
                            "
                          />
                          <div style="padding-left: 16px; text-align: left">
                            <h4
                              style="
                                color: #333333;
                                font-size: 22px;
                                margin: 0px;
                                margin-bottom: 8px;
                              "
                            >
                              ${data.userName || "[Applicant's Name]"}
                            </h4>
                            <a
                              href="mailto:${data.email || "[Applicant's Email]"}"
                              style="
                                color: #004d99;
                                text-decoration: none;
                                font-size: 16px;
                                margin: 0px;
                              "
                            >
                              ${data.email || "[Applicant's Email]"}
                            </a>
                          </div>
                        </div>

                        <div style="padding: 10px 25px 20px">
                          <table style="width: 100%; border-collapse: collapse">
                            <tr>
                              <td style="padding: 8px 0; font-weight: bold; color: #555555; width: 35%">Department:</td>
                              <td style="padding: 8px 0; color: #004d99; font-weight: 600">${
                                data.department || "[Applicant's Department]"
                              }</td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; font-weight: bold; color: #555555">Batch:</td>
                              <td style="padding: 8px 0">
                                ${data.batch || "[Applicant's Batch]"}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; font-weight: bold; color: #555555">Session:</td>
                              <td style="padding: 8px 0">
                                ${data.session || "[Applicant's session]"}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; font-weight: bold; color: #555555">Student ID:</td>
                              <td style="padding: 8px 0">
                                ${data.studentId || "[Applicant's Student ID]"}
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0; font-weight: bold; color: #555555">Contact Number:</td>
                              <td style="padding: 8px 0">
                                ${data.contactNumber || "[Applicant's Student ID]"}
                              </td>
                            </tr>
                          </table>
                        </div>

                        <div style="text-align: center; padding: 0 25px 20px">
                          <a
                            href="[Link to Review Application]"
                            target="_blank"
                            style="
                              display: inline-block;
                              padding: 12px 25px;
                              background-color: #28a745;
                              color: white;
                              text-decoration: none;
                              border-radius: 8px;
                              font-weight: bold;
                              font-size: 16px;
                              transition: background-color 0.3s;
                            "
                          >
                            Review Application
                          </a>
                        </div>

                        <div
                          style="
                            background-color: #f7f7f7;
                            padding: 10px 20px;
                            text-align: center;
                            font-size: 12px;
                            color: #888888;
                            border-bottom-left-radius: 12px;
                            border-bottom-right-radius: 12px;
                          "
                        >
                          Please review and approve the details above.
                        </div>
                      </div>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="body-text" style="text-align: left ; margin-top: 24px">Stay Energized! Our Community is uprising! 🚀 </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "loginSecurityCode":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Login Security Code - ${clubName}</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Your MEC Computer Club security login code is ${data.code}. Valid for 30 minutes.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">Security Code for Login</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName || "Member"},</strong> <br>
                        Multiple unsuccessful login attempts were detected on your <strong>${clubName}</strong> account.
                        To prevent your account from being locked out, you can enter the one-time security code below alongside your credentials to verify your identity:
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px">
                            <div class="otp-container">
                              <span class="otp-label">One-Time Security Code</span>
                              <span class="otp-value">${data.code}</span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="warning-box">
                              ⏰ Valid for <strong>30 minutes</strong>. After 5 failed attempts, the account will be locked for 30 minutes unless unlocked with this code.
                            </p>

                            <p class="body-text" style="text-align: left; margin-top: 24px">
                              If you did not initiate these login attempts, someone may be attempting to access your account. We strongly advise resetting your password immediately.
                            </p>
                          </td>
                        </tr>
                      </table>

                      ${
                        data.link
                          ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px; color: #ffffff">
                            <a href="${data.link}" target="_blank" class="btn-primary">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      `
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "deviceBlocked":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Security Alert: Device Blocked - ${clubName}</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      Security Alert: An unrecognized device was blocked from attempting to log into your MEC Computer Club account.
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text" style="color: #dc2626;">Security Alert: Device Blocked</h1>

                      <p class="body-text">
                        <strong>Hi ${data.userName || "Member"},</strong> <br>
                        While you were logged in and active on your account, another device attempted to log into your <strong>${clubName}</strong> account with 3 incorrect passwords.
                      </p>

                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center">
                            <p class="warning-box" style="border-left-color: #dc2626;">
                              🛡️ That device has been <strong>blocked</strong> from submitting further login attempts against your account.
                            </p>

                            <p class="body-text" style="text-align: left; margin-top: 24px">
                              ${data.deviceInfo ? `<strong>Device:</strong> ${data.deviceInfo}<br>` : ""}
                              ${data.ipAddress ? `<strong>IP Address:</strong> ${data.ipAddress}<br>` : ""}
                              If this was not you, we strongly recommend that you update your password immediately to ensure your account remains safe.
                            </p>
                          </td>
                        </tr>
                      </table>

                      ${
                        data.link
                          ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px; color: #ffffff">
                            <a href="${data.link}" target="_blank" class="btn-primary">
                              Secure Account & Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      `
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "adminMailForContactMessage":
      return `
      <!DOCTYPE html>
<html
  lang="en"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>New Contact Form Inquiry - MEC Computer Club</title>

    ${getStyle()}
  </head>

  <body>
    <div class="preheader">
      New contact message received from ${data.senderName || "Visitor"} (${data.senderEmail || ""}).
    </div>

    <table border="0" cellpadding="0" cellspacing="0" class="main-wrapper">
      <tr>
        <td align="center" class="main-cell">
          <table border="0" cellpadding="0" cellspacing="0" class="card-container">
            <tr>
              <td align="center" class="card">
                ${getHeader()}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td class="content-padding">
                      <h1 class="header-text">New Contact Message</h1>

                      <p class="body-text">
                        <strong>Hi Admin,</strong> <br>
                        A new inquiry has been submitted through the MEC Computer Club contact form. Details are below:
                      </p>

                      <div
                        style="
                          font-family: Arial, sans-serif;
                          max-width: 480px;
                          margin: 20px auto;
                          border: 1px solid #e0e0e0;
                          border-radius: 12px;
                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                          background-color: #ffffff;
                          overflow: hidden;
                        "
                      >
                        <div
                          style="
                            background-color: #004d99;
                            color: white;
                            padding: 14px 20px;
                            text-align: left;
                            border-top-left-radius: 12px;
                            border-top-right-radius: 12px;
                          "
                        >
                          <p style="margin: 0; font-size: 16px; font-weight: bold">Inquiry Details</p>
                        </div>

                        <div style="padding: 18px 20px; text-align: left;">
                          <p style="margin: 0 0 10px; font-size: 14px; color: #555;">
                            <strong style="color: #222;">From:</strong> ${data.senderName || "Unknown"}
                          </p>
                          <p style="margin: 0 0 10px; font-size: 14px; color: #555;">
                            <strong style="color: #222;">Email:</strong>
                            <a href="mailto:${data.senderEmail}" style="color: #004d99; text-decoration: none;">
                              ${data.senderEmail || "N/A"}
                            </a>
                          </p>
                          <p style="margin: 0 0 12px; font-size: 14px; color: #555;">
                            <strong style="color: #222;">Subject:</strong> ${data.subject || "No Subject"}
                          </p>
                          <div style="margin-top: 14px; padding: 12px; background-color: #f8fafc; border-left: 4px solid #004d99; border-radius: 4px;">
                            <strong style="display: block; font-size: 13px; color: #333; margin-bottom: 6px;">Message:</strong>
                            <p style="margin: 0; font-size: 14px; color: #444; white-space: pre-wrap; line-height: 1.5;">${data.message || ""}</p>
                          </div>
                        </div>
                      </div>

                      ${
                        data.link
                          ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td align="center" style="padding-bottom: 24px; padding-top: 10px;">
                            <a href="${data.link}" target="_blank" class="btn-primary">
                              View in Admin Dashboard
                            </a>
                          </td>
                        </tr>
                      </table>
                      `
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${getFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    case "welcomeOnboard":
      return generateGenericEmail({
        title: "Welcome to MEC Computer Club!",
        greeting: `Welcome aboard, ${data.userName || "Member"}! 🎉`,
        bodyParagraphs: [
          `We are absolutely thrilled to welcome you to the MEC Computer Club community. Your official club membership is now active.`,
          `As a member, you will gain access to exclusive technical workshops, programming contests, research groups, industry mentorship, and collaborative hackathons.`,
          `To get started, explore your member dashboard, connect your profile, and join our official communication channels.`,
        ],
        ctaText: "Explore Member Dashboard",
        ctaUrl: data.dashboardLink || data.link || "https://meccomputerclub.org/dashboard",
        clubName,
        footerNote: "Need help getting started? Reach out to your batch representative or club moderators.",
      });

    case "roleAssignment":
      return generateGenericEmail({
        title: "Executive Role Assignment Notice",
        greeting: `Dear ${data.userName || "Executive"},`,
        bodyParagraphs: [
          `We are delighted to formally announce your appointment as <strong>${data.roleTitle || "Club Executive"}</strong> for MEC Computer Club.`,
          `Your leadership and dedication to the tech community will play a vital role in organizing premier events, mentoring fellow students, and elevating our club's impact.`,
          `Your administrative privileges and dashboard permissions have been updated accordingly.`,
        ],
        detailsTable: [
          { label: "Assigned Role", value: data.roleTitle || "Executive Member" },
          { label: "Department / Batch", value: `${data.department || "CSE"} (${data.batch || "Executive Panel"})` },
          { label: "Effective Date", value: data.registrationDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
        ],
        ctaText: "Access Executive Dashboard",
        ctaUrl: data.dashboardLink || "https://meccomputerclub.org/dashboard",
        clubName,
      });

    case "recruitmentDrive":
      return generateGenericEmail({
        title: "MEC Computer Club Recruitment Drive",
        greeting: `Hello ${data.userName || "Student"},`,
        bodyParagraphs: [
          `The official recruitment drive for MEC Computer Club is now live! If you are passionate about software engineering, competitive programming, cybersecurity, AI, or event management, this is your platform.`,
          `Join a thriving community of builders, innovators, and leaders at Mymensingh Engineering College.`,
          `Submit your application today before the deadline passes!`,
        ],
        ctaText: "Apply for Membership",
        ctaUrl: data.link || "https://meccomputerclub.org/register",
        warningText: "Registration closes soon. Applications are reviewed on a rolling basis.",
        clubName,
      });

    case "eventInvitation":
      return generateGenericEmail({
        title: data.eventName ? `Invitation: ${data.eventName}` : "Exclusive Event Invitation",
        greeting: `Hi ${data.userName || "Tech Enthusiast"},`,
        bodyParagraphs: [
          `MEC Computer Club is hosting an exciting upcoming event: <strong>${data.eventName || "MEC Tech Summit & Hackathon"}</strong>!`,
          `Join us for inspiring keynote talks, live coding challenges, hands-on workshops, and networking with industry professionals and alumni.`,
          `Seats are strictly limited, so please secure your spot as soon as possible.`,
        ],
        detailsTable: [
          { label: "Event", value: data.eventName || "Annual Tech Fiesta" },
          { label: "Date & Time", value: data.eventDate || "Upcoming Saturday, 10:00 AM" },
          { label: "Venue", value: data.eventVenue || "MEC Auditorium & Lab 301" },
        ],
        ctaText: "Register for Event",
        ctaUrl: data.link || "https://meccomputerclub.org/events",
        clubName,
      });

    case "eventRegistrationConfirm":
      return generateGenericEmail({
        title: "Event Registration Confirmed!",
        greeting: `Hi ${data.userName || "Participant"},`,
        bodyParagraphs: [
          `Your registration for <strong>${data.eventName || "Club Event"}</strong> has been confirmed. We have reserved your seat!`,
          `Please arrive 15 minutes before the scheduled start time and show this confirmation email or your member ID at the check-in desk.`,
        ],
        detailsTable: [
          { label: "Event", value: data.eventName || "Club Event" },
          { label: "Date & Time", value: data.eventDate || "Scheduled Date" },
          { label: "Venue", value: data.eventVenue || "Campus Venue" },
          { label: "Registration Code", value: data.code || "REG-CONFIRMED" },
        ],
        ctaText: "View Event Details",
        ctaUrl: data.link || "https://meccomputerclub.org/events",
        clubName,
      });

    case "eventRecap":
      return generateGenericEmail({
        title: data.eventName ? `Highlights: ${data.eventName}` : "Event Recap & Highlights",
        greeting: `Dear ${data.userName || "Friend"},`,
        bodyParagraphs: [
          `Thank you for being part of <strong>${data.eventName || "our recent event"}</strong>! It was an incredible gathering of talent, innovation, and passion.`,
          `Event photo galleries, speaker slides, and contest leaderboards are now published and accessible on our official portal.`,
          `We hope you enjoyed every moment and took away valuable insights.`,
        ],
        ctaText: "View Event Highlights & Photos",
        ctaUrl: data.link || "https://meccomputerclub.org/events",
        clubName,
      });

    case "eventCertificate":
      return generateGenericEmail({
        title: "Your Certificate of Participation / Achievement",
        greeting: `Congratulations ${data.userName || "Participant"}! 🎖️`,
        bodyParagraphs: [
          `In recognition of your active participation and outstanding performance in <strong>${data.eventName || "MEC Tech Event"}</strong>, we are proud to present your verified digital certificate.`,
          `Your certificate includes a verifiable credential ID that can be added directly to your LinkedIn profile and CV.`,
        ],
        ctaText: "Download Certificate",
        ctaUrl: data.certificateUrl || data.link || "https://meccomputerclub.org/verify-certificate",
        clubName,
      });

    case "facultyInvitation":
      return generateGenericEmail({
        title: "Invitation to Judge / Deliver Keynote - MEC Computer Club",
        greeting: `Respected ${data.userName || "Professor / Speaker"},`,
        bodyParagraphs: [
          `On behalf of MEC Computer Club and Mymensingh Engineering College, we have the distinct honor of inviting you as an esteemed <strong>Guest Speaker / Judge</strong> for <strong>${data.eventName || "our upcoming tech event"}</strong>.`,
          `Your expertise and distinguished experience would provide invaluable inspiration and guidance to our students and participants.`,
          `We would be deeply honored by your presence. Please find event details and our official invitation letter below.`,
        ],
        detailsTable: [
          { label: "Event", value: data.eventName || "MEC Tech Carnival" },
          { label: "Date & Time", value: data.eventDate || "TBA" },
          { label: "Venue", value: data.eventVenue || "Mymensingh Engineering College" },
        ],
        ctaText: "Confirm Availability",
        ctaUrl: data.link || "https://meccomputerclub.org/contact-us",
        clubName,
      });

    case "sponsorProposal":
      return generateGenericEmail({
        title: "Partnership & Sponsorship Proposal - MEC Computer Club",
        greeting: `Dear ${data.sponsorName || data.userName || "Valued Partner"},`,
        bodyParagraphs: [
          `Greetings from MEC Computer Club at Mymensingh Engineering College!`,
          `We are delighted to invite <strong>${data.organizationName || "your organization"}</strong> to collaborate with us as an official partner for our upcoming flagship event: <strong>${data.eventName || "MEC National Tech Fest"}</strong>.`,
          `This initiative will bring together hundreds of high-potential engineering students, developers, and tech enthusiasts, offering exceptional brand visibility and direct talent engagement.`,
          `We invite you to review our attached sponsorship deck and explore the collaborative tiers designed to maximize your brand impact.`,
        ],
        ctaText: "View Sponsorship Proposal Deck",
        ctaUrl: data.proposalLink || data.link || "https://meccomputerclub.org/sponsors",
        clubName,
      });

    case "sponsorThankYou":
      return generateGenericEmail({
        title: "Heartfelt Thanks for Your Partnership & Support",
        greeting: `Dear ${data.sponsorName || data.userName || "Esteemed Sponsor"},`,
        bodyParagraphs: [
          `On behalf of the students, faculty, and executives of MEC Computer Club, we extend our heartfelt gratitude to <strong>${data.organizationName || "your organization"}</strong> for your generous sponsorship.`,
          `Your support made a significant difference in bringing <strong>${data.eventName || "our flagship event"}</strong> to life and empowering young innovators.`,
          `We look forward to an enduring and impactful relationship with your team.`,
        ],
        ctaText: "View Post-Event Summary",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "sponsorPostEvent":
      return generateGenericEmail({
        title: "Sponsor Impact & Post-Event Analytics Report",
        greeting: `Dear ${data.sponsorName || data.userName || "Partner"},`,
        bodyParagraphs: [
          `We are delighted to share the official Post-Event Analytics & Brand Reach Report for <strong>${data.eventName || "our recent tech event"}</strong>.`,
          `Thanks to your support, we achieved unprecedented engagement, with extensive on-campus, digital, and social media brand impressions.`,
          `Enclosed is the comprehensive report highlighting participant demographics, photo gallery highlights, and branding placements.`,
        ],
        ctaText: "Download Sponsor Impact Report",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "sponsorRenewal":
      return generateGenericEmail({
        title: "Sponsorship Term Renewal - MEC Computer Club",
        greeting: `Dear ${data.sponsorName || data.userName || "Partner"},`,
        bodyParagraphs: [
          `As we embark on a new academic session at Mymensingh Engineering College, we would like to invite <strong>${data.organizationName || "your organization"}</strong> to renew your valued partnership with MEC Computer Club.`,
          `With an expanded calendar of programming contests, hackathons, and workshops, this year promises even greater visibility and talent acquisition opportunities.`,
          `We would be honored to schedule a brief discussion to discuss customized renewal packages.`,
        ],
        ctaText: "Discuss Partnership Renewal",
        ctaUrl: data.link || "https://meccomputerclub.org/contact-us",
        clubName,
      });

    case "sponsorInvoice":
      return generateGenericEmail({
        title: "Sponsorship Documentation & Logistics Notice",
        greeting: `Dear ${data.sponsorName || data.userName || "Finance / Partnership Team"},`,
        bodyParagraphs: [
          `Please find the official sponsorship invoice and logistical documentation regarding your partnership with MEC Computer Club for <strong>${data.eventName || "our annual program"}</strong>.`,
          `Our team has verified all agreed branding deliverables and collateral allocations. Please review the payment and accounting details at your earliest convenience.`,
        ],
        detailsTable: [
          { label: "Organization", value: data.organizationName || "Partner" },
          { label: "Sponsorship Tier", value: data.tierName || "Official Partner" },
          { label: "Status", value: "Invoice Dispatched" },
        ],
        ctaText: "View Invoice & Documents",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "collabProposal":
      return generateGenericEmail({
        title: "Collaboration & Co-Host Proposal - MEC Computer Club",
        greeting: `Greetings to the Team at ${data.organizationName || "Partner Club / Organization"},`,
        bodyParagraphs: [
          `MEC Computer Club at Mymensingh Engineering College is reaching out to propose an exciting joint initiative: <strong>${data.eventName || "Inter-Club Collaborative Hackathon"}</strong>!`,
          `We believe that by pooling our communities, resources, and shared passions, we can deliver an extraordinary experience for aspiring technologists.`,
          `We would love to connect for a brief virtual coordination meeting to discuss potential dates, event format, and shared responsibilities.`,
        ],
        ctaText: "Review Collaboration Proposal",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "collabConfirmation":
      return generateGenericEmail({
        title: "Partnership & Collaboration Confirmed!",
        greeting: `Dear ${data.userName || "Collaborators"},`,
        bodyParagraphs: [
          `We are thrilled to officially confirm our partnership between MEC Computer Club and <strong>${data.organizationName || "your esteemed team"}</strong> for <strong>${data.eventName || "the upcoming collaborative initiative"}</strong>!`,
          `Our executive teams will coordinate on co-branding, registration channels, schedule execution, and participant outreach.`,
          `Here is to an incredible event and a lasting partnership!`,
        ],
        ctaText: "View Shared Workspace",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "contactReplyMembership":
      return generateGenericEmail({
        title: "Response Regarding Membership & Application Inquiry",
        greeting: `Dear ${data.userName || "Student"},`,
        bodyParagraphs: [
          `Thank you for reaching out to MEC Computer Club regarding membership and recruitment.`,
          data.replyMessage || data.message || `We have received your inquiry. Memberships are open to all enthusiastic students of Mymensingh Engineering College during our semester recruitment drives.`,
          `If you have received an official invitation key, you can complete your registration immediately using the link below.`,
        ],
        ctaText: "Register for Membership",
        ctaUrl: data.link || "https://meccomputerclub.org/register",
        clubName,
        footerNote: "You are receiving this in response to your message submitted through our website contact form.",
      });

    case "contactReplyGeneral":
      return generateGenericEmail({
        title: data.subject || "Reply from MEC Computer Club Support",
        greeting: `Dear ${data.userName || "Friend"},`,
        bodyParagraphs: [
          `Thank you for contacting MEC Computer Club. We have carefully reviewed your message.`,
          data.replyMessage || data.message || `Our moderation team is here to assist with any questions regarding club activities, lab resources, and events.`,
          `Please feel free to reply directly to this email if you need any additional clarification.`,
        ],
        ctaText: "Visit Club Portal",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
        footerNote: "Official communication from MEC Computer Club Administration.",
      });

    case "contactReplySponsorship":
      return generateGenericEmail({
        title: "Response Regarding Sponsorship & Corporate Collaboration",
        greeting: `Dear ${data.userName || "Partner"},`,
        bodyParagraphs: [
          `Thank you for your interest in partnering with MEC Computer Club!`,
          data.replyMessage || data.message || `We are eager to explore mutually beneficial sponsorship opportunities for our upcoming events and student initiatives.`,
          `Our corporate relations lead has reviewed your inquiry and will follow up with full details and our sponsorship prospectus.`,
        ],
        ctaText: "Explore Club Sponsorships",
        ctaUrl: data.link || "https://meccomputerclub.org/sponsors",
        clubName,
      });

    case "contactReplyEvent":
      return generateGenericEmail({
        title: "Response Regarding Event Collaboration & Queries",
        greeting: `Hello ${data.userName || "Friend"},`,
        bodyParagraphs: [
          `Thank you for reaching out to the MEC Computer Club Events Committee.`,
          data.replyMessage || data.message || `We appreciate your interest in our upcoming competitions and workshops. Details regarding schedules, problem sets, and eligibility are continuously updated on our portal.`,
          `If you have specific logistical requirements or team registration queries, our team is at your service.`,
        ],
        ctaText: "View Event Information",
        ctaUrl: data.link || "https://meccomputerclub.org/events",
        clubName,
      });

    case "contactReplyFeedback":
      return generateGenericEmail({
        title: "Thank You for Your Feedback & Suggestions",
        greeting: `Dear ${data.userName || "Member"},`,
        bodyParagraphs: [
          `Thank you for sharing your valuable feedback with MEC Computer Club!`,
          data.replyMessage || data.message || `Community suggestions are essential for us to continuously improve our workshops, facilities, and club culture.`,
          `Our executive panel has noted your thoughts and will consider them in our planning sessions.`,
        ],
        ctaText: "Return to Homepage",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    case "thankYouRecognition":
      return generateGenericEmail({
        title: "Certificate of Appreciation & Recognition",
        greeting: `Dear ${data.userName || "Contributor"}, 🌟`,
        bodyParagraphs: [
          `On behalf of the entire MEC Computer Club family, we want to express our deepest gratitude for your stellar contributions and dedication.`,
          `Your passion, hard work, and voluntary support have made a lasting impression on our club community and helped ensure the success of our initiatives.`,
          `Thank you for being an indispensable part of our journey!`,
        ],
        ctaText: "View Club Showcase",
        ctaUrl: data.link || "https://meccomputerclub.org",
        clubName,
      });

    default:
      if (data.bodyHtml) {
        return wrapBodyInTemplate(data.bodyHtml, {
          title: data.subject || "Notice from MEC Computer Club",
          greeting: data.userName ? `Hi ${data.userName},` : "Hello,",
          ctaText: data.ctaText,
          ctaUrl: data.ctaUrl,
          clubName,
        });
      }
      return generateGenericEmail({
        title: data.subject || "Notice from MEC Computer Club",
        greeting: data.userName ? `Hello ${data.userName},` : "Hello,",
        bodyParagraphs: [
          data.message || data.extraMessage || "You have a new official notification from MEC Computer Club.",
        ],
        ctaText: data.ctaText,
        ctaUrl: data.ctaUrl || data.link,
        clubName,
      });
  }
}

// const html1 = generateEmail("invitation", {
//   userName: "Nasir",
//   code: "734484",
//   link: "https://www.meccomputerclub.org/register",
// });

// console.log(html1);

// const html2 = generateEmail("rejection", {
//   userName: "Nasir",
//   link: "https://www.meccomputerclub.org/contact-us",
// });

// console.log(html2);

// const html3 = generateEmail("passwordReset", {
//   userName: "Nasir",
//   code: "734484",
//   link: "https://www.meccomputerclub.org/reset-password",
// });

// console.log(html3);

// const html4 = generateEmail("emailVerification", {
//   userName: "Nasir",
//   code: "734484",
//   link: "https://www.meccomputerclub.org/verify-email",
// });
// console.log(html4);

// const html5 = generateEmail("status", {
//   userName: "Nasir",
//   status: "Approved",
//   link: "https://www.meccomputerclub.org/dashboard",
// });
// console.log(html5);

// const html6 = generateEmail("adminMailForMemberRegistration", {
//   userImageUrl: "https://via.placeholder.com/100",
//   userName: "John Doe",
//   department: "Computer Science",
//   batch: "2023",
//   session: "2023-2024",
//   studentId: "123456",
//   contactNumber: "1234567890",
//   registrationDate: new Date().toLocaleDateString(),
//   link: "https://www.meccomputerclub.org/register",
// });

// console.log(html6);
