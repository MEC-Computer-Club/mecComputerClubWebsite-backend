import { Request, Response } from "express";
import SiteSetting from "../models/SiteSetting.model";
import {
  generateEmail,
  wrapBodyInTemplate,
  EmailType,
  getGlobalEmailBranding,
  setGlobalEmailBranding,
  EmailBrandingConfig,
} from "../utils/generateEmailTemplate";
import { sendEmail } from "../utils/sendEmail";

export type TemplateCategory =
  | "authentication"
  | "membership"
  | "invitations"
  | "events"
  | "sponsors"
  | "collaborations"
  | "contact"
  | "administrative"
  | "custom";

export interface TemplateMeta {
  key: string;
  title: string;
  category: TemplateCategory;
  description: string;
  defaultSubject: string;
  variables: { name: string; description: string; sample: string }[];
  isCustomCreated?: boolean;
}

export const TEMPLATES_CATALOG: TemplateMeta[] = [
  // 🔐 Authentication
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
    key: "loginSecurityCode",
    title: "Login Security Code (2FA)",
    category: "authentication",
    description: "Dispatched when an account login occurs from a new device, location, or requires two-factor validation.",
    defaultSubject: "Your Login Security Code - MEC Computer Club",
    variables: [
      { name: "userName", description: "Account holder's name", sample: "Nasir Ahmed" },
      { name: "code", description: "6-digit authentication security code", sample: "392014" },
      { name: "deviceInfo", description: "Detected browser / device string", sample: "Chrome 122 on Windows 11" },
      { name: "ipAddress", description: "Login request IP address", sample: "103.114.98.12" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "deviceBlocked",
    title: "Device Blocked Alert",
    category: "authentication",
    description: "Urgent security notification sent when repeated failed login attempts trigger an automated device block.",
    defaultSubject: "Security Notice: Suspicious Login Blocked - MEC Computer Club",
    variables: [
      { name: "userName", description: "Account holder's name", sample: "Nasir Ahmed" },
      { name: "deviceInfo", description: "Blocked device identifier", sample: "Firefox on Linux" },
      { name: "ipAddress", description: "Originating IP address", sample: "194.26.29.11" },
      { name: "contactLink", description: "Security team contact URL", sample: "https://meccomputerclub.org/contact-us" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },

  // 👥 Membership & Onboarding
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
    title: "Application Status / Regret",
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
    key: "welcomeOnboard",
    title: "Welcome & Onboarding Guide",
    category: "membership",
    description: "Comprehensive orientation email sent to newly inducted members explaining club resources and culture.",
    defaultSubject: "Welcome to MEC Computer Club! 🚀 Your Journey Starts Here",
    variables: [
      { name: "userName", description: "New member's name", sample: "Anika Tabassum" },
      { name: "dashboardLink", description: "Direct link to dashboard", sample: "https://meccomputerclub.org/dashboard" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
  {
    key: "roleAssignment",
    title: "Executive / Role Assignment Notice",
    category: "membership",
    description: "Official announcement sent when a member is promoted to an executive role or sub-committee lead.",
    defaultSubject: "Executive Appointment Notice - MEC Computer Club",
    variables: [
      { name: "userName", description: "Appointed executive's name", sample: "Md. Nasir Ahmed" },
      { name: "roleTitle", description: "Official role designation", sample: "Head of Tech & Web Operations" },
      { name: "department", description: "Academic Department", sample: "CSE" },
      { name: "batch", description: "Academic Batch", sample: "8th Batch" },
      { name: "dashboardLink", description: "Executive dashboard URL", sample: "https://meccomputerclub.org/dashboard" },
    ],
  },

  // ✉️ Invitations & Outreach
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
    key: "recruitmentDrive",
    title: "Recruitment Drive Announcement",
    category: "invitations",
    description: "Broadcast outreach email sent to students inviting them to apply during open recruitment seasons.",
    defaultSubject: "MEC Computer Club Recruitment is Now Live! Apply Today",
    variables: [
      { name: "userName", description: "Prospective student's name", sample: "MECian" },
      { name: "link", description: "Online registration application link", sample: "https://meccomputerclub.org/register" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },

  // 🎓 Events & Competitions
  {
    key: "eventInvitation",
    title: "Event Invitation & Announcement",
    category: "events",
    description: "Broadcast invitation sent to members and students for upcoming workshops, contests, and seminars.",
    defaultSubject: "You're Invited: MEC Intra-College Code Fest 2026",
    variables: [
      { name: "userName", description: "Recipient full name", sample: "Tanvir Rahman" },
      { name: "eventName", description: "Title of the upcoming event", sample: "MEC Intra-College Code Fest 2026" },
      { name: "eventDate", description: "Date and time of the event", sample: "March 28, 2026 at 10:00 AM" },
      { name: "eventVenue", description: "Physical campus venue or lab", sample: "Auditorium & CSE Lab 301" },
      { name: "link", description: "Event registration and RSVP link", sample: "https://meccomputerclub.org/events" },
    ],
  },
  {
    key: "eventRegistrationConfirm",
    title: "Event Registration Confirmation",
    category: "events",
    description: "Instant confirmation ticket sent after a user registers or RSVPs for an official club event.",
    defaultSubject: "Registration Confirmed: MEC Intra-College Code Fest 2026",
    variables: [
      { name: "userName", description: "Participant's name", sample: "Tanvir Rahman" },
      { name: "eventName", description: "Registered event title", sample: "MEC Intra-College Code Fest 2026" },
      { name: "code", description: "Registration / Ticket reference code", sample: "TICKET-7892-CF" },
      { name: "eventDate", description: "Event schedule", sample: "March 28, 2026 at 10:00 AM" },
      { name: "eventVenue", description: "Event location", sample: "Auditorium & CSE Lab 301" },
      { name: "link", description: "Event details portal URL", sample: "https://meccomputerclub.org/events" },
    ],
  },
  {
    key: "eventRecap",
    title: "Post-Event Highlights & Recap",
    category: "events",
    description: "Follow-up email sent to attendees featuring photo galleries, winner announcements, and slide downloads.",
    defaultSubject: "Event Recap & Highlights: MEC Intra-College Code Fest 2026",
    variables: [
      { name: "userName", description: "Attendee full name", sample: "Tanvir Rahman" },
      { name: "eventName", description: "Completed event title", sample: "MEC Intra-College Code Fest 2026" },
      { name: "link", description: "Link to photo gallery and contest leaderboard", sample: "https://meccomputerclub.org/events" },
    ],
  },
  {
    key: "eventCertificate",
    title: "Certificate of Participation / Award",
    category: "events",
    description: "Sent with verifiable credential links for participants, winners, and workshop graduates.",
    defaultSubject: "Your Verified Certificate: MEC Intra-College Code Fest 2026",
    variables: [
      { name: "userName", description: "Participant or awardee name", sample: "Tanvir Rahman" },
      { name: "eventName", description: "Event / Workshop title", sample: "MEC Intra-College Code Fest 2026" },
      { name: "certificateUrl", description: "Direct verifiable certificate URL", sample: "https://meccomputerclub.org/verify-certificate?id=CERT-2026-981" },
    ],
  },

  // 🏢 Faculty, Speakers & Sponsors
  {
    key: "facultyInvitation",
    title: "Faculty, Judge & Speaker Invite",
    category: "sponsors",
    description: "Formal letter of invitation sent to distinguished professors, keynote speakers, and contest judges.",
    defaultSubject: "Official Invitation to Judge / Speak - MEC Computer Club",
    variables: [
      { name: "userName", description: "Distinguished guest's full name", sample: "Prof. Dr. M. A. Karim" },
      { name: "eventName", description: "Event name", sample: "National Hackathon 2026" },
      { name: "eventDate", description: "Event date", sample: "April 15, 2026" },
      { name: "eventVenue", description: "Event venue", sample: "MEC Main Auditorium" },
      { name: "link", description: "Confirmation or portal link", sample: "https://meccomputerclub.org/contact-us" },
    ],
  },
  {
    key: "sponsorProposal",
    title: "Sponsorship & Partnership Proposal",
    category: "sponsors",
    description: "Executive proposal letter sent to corporate partners presenting sponsorship tiers and brand reach.",
    defaultSubject: "Corporate Partnership Proposal - MEC Computer Club Tech Fest 2026",
    variables: [
      { name: "sponsorName", description: "Contact person at corporate partner", sample: "Corporate Relations Team" },
      { name: "organizationName", description: "Partner company or organization", sample: "TechCorp Global" },
      { name: "eventName", description: "Flagship event title", sample: "MEC National Tech Fest 2026" },
      { name: "proposalLink", description: "Direct link to sponsorship PDF deck", sample: "https://meccomputerclub.org/sponsors" },
    ],
  },
  {
    key: "sponsorThankYou",
    title: "Sponsor Appreciation & Impact",
    category: "sponsors",
    description: "Warm gratitude letter sent to sponsors thanking them for their financial or logistic support.",
    defaultSubject: "With Gratitude: Thank You for Supporting MEC Tech Fest 2026",
    variables: [
      { name: "sponsorName", description: "Partner contact person", sample: "Mr. Rahim Chowdhury" },
      { name: "organizationName", description: "Sponsoring brand", sample: "TechCorp Global" },
      { name: "eventName", description: "Event sponsored", sample: "MEC National Tech Fest 2026" },
      { name: "link", description: "Post-event showcase URL", sample: "https://meccomputerclub.org" },
    ],
  },
  {
    key: "sponsorPostEvent",
    title: "Sponsor Post-Event Analytics Report",
    category: "sponsors",
    description: "Formal report delivering reach metrics, student demographics, and photo collateral to sponsors.",
    defaultSubject: "Post-Event Analytics & Brand Impact Report - MEC Tech Fest 2026",
    variables: [
      { name: "sponsorName", description: "Partner representative", sample: "Mr. Rahim Chowdhury" },
      { name: "eventName", description: "Event title", sample: "MEC National Tech Fest 2026" },
      { name: "link", description: "Full report download link", sample: "https://meccomputerclub.org" },
    ],
  },
  {
    key: "sponsorRenewal",
    title: "Sponsorship Renewal Request",
    category: "sponsors",
    description: "Sent ahead of the new academic cycle inviting existing partners to renew their annual sponsorship.",
    defaultSubject: "Annual Partnership Renewal - MEC Computer Club 2026-2027",
    variables: [
      { name: "sponsorName", description: "Partner representative", sample: "Mr. Rahim Chowdhury" },
      { name: "organizationName", description: "Partner company", sample: "TechCorp Global" },
      { name: "link", description: "Partnership contact URL", sample: "https://meccomputerclub.org/contact-us" },
    ],
  },
  {
    key: "sponsorInvoice",
    title: "Sponsorship Invoice & Logistics",
    category: "sponsors",
    description: "Formal documentation transmitting official payment details, invoices, and tax receipts.",
    defaultSubject: "Sponsorship Documentation & Official Invoice - MEC Computer Club",
    variables: [
      { name: "sponsorName", description: "Finance or Accounts lead", sample: "Accounts Department" },
      { name: "organizationName", description: "Partner company name", sample: "TechCorp Global" },
      { name: "tierName", description: "Agreed sponsorship level", sample: "Platinum Title Sponsor" },
      { name: "link", description: "Invoice and receipts link", sample: "https://meccomputerclub.org" },
    ],
  },

  // 🤝 Collaborations & Clubs
  {
    key: "collabProposal",
    title: "Collaboration & Co-Host Proposal",
    category: "collaborations",
    description: "Outreach letter sent to peer university clubs or technical societies proposing joint events.",
    defaultSubject: "Inter-Club Collaboration Proposal - MEC Computer Club",
    variables: [
      { name: "organizationName", description: "Peer club / University society name", sample: "BUET Computer Club" },
      { name: "eventName", description: "Proposed collaborative event", sample: "National Inter-Club Hackathon" },
      { name: "link", description: "Joint workspace or proposal link", sample: "https://meccomputerclub.org" },
    ],
  },
  {
    key: "collabConfirmation",
    title: "Partnership Confirmation Notice",
    category: "collaborations",
    description: "Official confirmation sent once both club committees finalize a co-hosting arrangement.",
    defaultSubject: "Collaboration Confirmed! - MEC Computer Club & Partners",
    variables: [
      { name: "userName", description: "Co-host committee leads", sample: "Collaborating Executives" },
      { name: "organizationName", description: "Partner society", sample: "BUET Computer Club" },
      { name: "eventName", description: "Confirmed joint initiative", sample: "National Inter-Club Hackathon" },
      { name: "link", description: "Shared planning portal URL", sample: "https://meccomputerclub.org" },
    ],
  },

  // 💬 Contact Responses & Inquiries
  {
    key: "adminMailForContactMessage",
    title: "Contact Message Alert (Admin)",
    category: "contact",
    description: "Dispatched to club executives when an external visitor submits an inquiry via the website contact form.",
    defaultSubject: "New Website Contact Inquiry - MEC Computer Club",
    variables: [
      { name: "senderName", description: "Inquirer full name", sample: "Dr. Farhan Ahmed" },
      { name: "senderEmail", description: "Inquirer email address", sample: "farhan@example.com" },
      { name: "subject", description: "Submitted message subject", sample: "Keynote Speaker Inquiry" },
      { name: "message", description: "Inquirer message body", sample: "I would like to inquire about speaking at your upcoming AI seminar." },
      { name: "link", description: "Admin dashboard message review link", sample: "https://meccomputerclub.org/dashboard/contact-messages" },
    ],
  },
  {
    key: "contactReplyMembership",
    title: "Reply: Membership & Join Inquiries",
    category: "contact",
    description: "Standard response dispatched by admins to students inquiring about recruitment and joining procedures.",
    defaultSubject: "Regarding Your Inquiry: MEC Computer Club Membership",
    variables: [
      { name: "userName", description: "Inquirer name", sample: "Fahim Shahriar" },
      { name: "replyMessage", description: "Custom admin reply text", sample: "Our spring recruitment drive begins next week. You can prepare your GitHub profile and apply online." },
      { name: "link", description: "Membership application link", sample: "https://meccomputerclub.org/register" },
    ],
  },
  {
    key: "contactReplyGeneral",
    title: "Reply: General Inquiries",
    category: "contact",
    description: "Versatile communication template for addressing questions regarding club operations, campus labs, etc.",
    defaultSubject: "Response from MEC Computer Club Administration",
    variables: [
      { name: "userName", description: "Recipient name", sample: "Visitor" },
      { name: "replyMessage", description: "Admin response message", sample: "Thank you for reaching out. We have noted your request and our executive team will coordinate with you." },
      { name: "link", description: "Website link", sample: "https://meccomputerclub.org" },
    ],
  },
  {
    key: "contactReplySponsorship",
    title: "Reply: Sponsorship Inquiries",
    category: "contact",
    description: "Professional reply addressed to potential sponsors with our prospectus and meeting scheduling links.",
    defaultSubject: "Response: Sponsorship Opportunities with MEC Computer Club",
    variables: [
      { name: "userName", description: "Corporate representative name", sample: "Ms. Sadia Islam" },
      { name: "replyMessage", description: "Admin response message", sample: "We are thrilled to explore a sponsorship relationship for our upcoming national hackathon." },
      { name: "link", description: "Sponsorship prospectus page URL", sample: "https://meccomputerclub.org/sponsors" },
    ],
  },
  {
    key: "contactReplyEvent",
    title: "Reply: Event Collaboration Queries",
    category: "contact",
    description: "Response template for participants and schools inquiring about event rules, schedules, and logistics.",
    defaultSubject: "Response: Event Query - MEC Computer Club",
    variables: [
      { name: "userName", description: "Inquirer name", sample: "Contestant" },
      { name: "replyMessage", description: "Admin response message", sample: "Team registrations allow up to 3 members per team. All participants must bring valid institutional IDs." },
      { name: "link", description: "Event rulebook URL", sample: "https://meccomputerclub.org/events" },
    ],
  },
  {
    key: "contactReplyFeedback",
    title: "Reply: Suggestion & Feedback",
    category: "contact",
    description: "Appreciation reply sent to members who submit constructive suggestions, feature requests, or bug reports.",
    defaultSubject: "Thank You for Your Feedback - MEC Computer Club",
    variables: [
      { name: "userName", description: "Contributor name", sample: "Club Member" },
      { name: "replyMessage", description: "Admin response message", sample: "Thank you for sharing your thoughtful suggestion regarding our coding lab sessions. We will discuss it in our upcoming meeting." },
      { name: "link", description: "Club portal link", sample: "https://meccomputerclub.org" },
    ],
  },

  // 🏛️ Administrative & Recognition
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
  {
    key: "thankYouRecognition",
    title: "Volunteer / Member Recognition",
    category: "administrative",
    description: "Honoring email sent to outstanding executive members and event volunteers recognizing exceptional service.",
    defaultSubject: "Heartfelt Recognition & Gratitude - MEC Computer Club",
    variables: [
      { name: "userName", description: "Honored volunteer / member name", sample: "Md. Nasir Ahmed" },
      { name: "link", description: "Club executive showcase URL", sample: "https://meccomputerclub.org" },
      { name: "clubName", description: "Official club brand name", sample: "MEC Computer Club" },
    ],
  },
];

// Generate realistic mock sample data for template preview
export function getSampleDataForTemplate(key: string) {
  return {
    userName: "Md. Nasir Ahmed",
    code: "849201",
    link: "https://meccomputerclub.org/verify?token=sample_token_demo",
    dashboardLink: "https://meccomputerclub.org/dashboard",
    contactLink: "https://meccomputerclub.org/contact-us",
    status: "Approved",
    clubName: "MEC Computer Club",
    department: "CSE",
    batch: "8th Batch",
    session: "2019-20",
    studentId: "190101",
    contactNumber: "+8801712345678",
    registrationDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    userImageUrl: "https://res.cloudinary.com/dj1sjgitq/image/upload/v1768389923/uploads/club_logo/email_banner_lxbsq9.png",
    email: "applicant@mec.ac.bd",
    deviceInfo: "Chrome 122 on Windows 11",
    ipAddress: "103.114.98.12",
    roleTitle: "Head of Tech & Web Operations",
    eventName: "MEC Intra-College Code Fest 2026",
    eventDate: "March 28, 2026, 10:00 AM",
    eventVenue: "MEC Auditorium & Lab 301",
    certificateUrl: "https://meccomputerclub.org/verify-certificate?id=CERT-2026-981",
    sponsorName: "Rahim Chowdhury",
    organizationName: "TechCorp Global",
    tierName: "Platinum Title Sponsor",
    proposalLink: "https://meccomputerclub.org/sponsors",
    senderName: "Dr. Farhan Ahmed",
    senderEmail: "farhan@example.com",
    subject: "Inquiry Regarding AI Seminar",
    message: "We would like to propose a keynote address regarding modern AI architectures for your students.",
    replyMessage: "Thank you for reaching out to MEC Computer Club. We have reviewed your message and are thrilled to proceed.",
  };
}

/**
 * GET /api/email-templates
 * Returns catalog of all templates (built-in + user-created) with current customized or default HTML
 */
export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    // 1. Fetch overrides of built-in templates (email_tpl_*)
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

    // 2. Fetch user-created custom templates (email_custom_tpl_*)
    const userCreatedDocs = await SiteSetting.find({
      key: { $regex: /^email_custom_tpl_/ },
    }).lean();

    const userCreatedTemplates: any[] = [];
    userCreatedDocs.forEach((doc) => {
      try {
        const parsed = JSON.parse(doc.value);
        userCreatedTemplates.push({
          key: parsed.key,
          title: parsed.title,
          category: parsed.category || "custom",
          description: parsed.description || "Custom user-created template",
          defaultSubject: parsed.defaultSubject || parsed.subject,
          subject: parsed.subject || parsed.defaultSubject,
          html: parsed.html,
          variables: parsed.variables || [
            { name: "userName", description: "Recipient name", sample: "Member Name" },
            { name: "clubName", description: "Club brand name", sample: "MEC Computer Club" },
            { name: "link", description: "Action link", sample: "https://meccomputerclub.org" },
          ],
          isCustomized: true,
          isCustomCreated: true,
        });
      } catch {
        // Skip malformed entries
      }
    });

    // 3. Assemble catalog templates
    const builtInTemplates = TEMPLATES_CATALOG.map((item) => {
      const custom = customMap.get(item.key);
      const isCustomized = Boolean(custom && custom.html);
      const html = isCustomized ? custom!.html : generateEmail(item.key as EmailType, getSampleDataForTemplate(item.key));
      const subject = (custom && custom.subject) || item.defaultSubject;

      return {
        ...item,
        isCustomized,
        isCustomCreated: false,
        subject,
        html,
      };
    });

    const allTemplates = [...builtInTemplates, ...userCreatedTemplates];
    return res.status(200).json({ success: true, data: allTemplates });
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

    // First check user-created custom templates
    const customDoc = await SiteSetting.findOne({ key: `email_custom_tpl_${key}` }).lean();
    if (customDoc && customDoc.value) {
      try {
        const parsed = JSON.parse(customDoc.value);
        return res.status(200).json({
          success: true,
          data: {
            ...parsed,
            isCustomized: true,
            isCustomCreated: true,
          },
        });
      } catch {
        // Fall through
      }
    }

    // Check built-in catalog
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
      html = generateEmail(meta.key as EmailType, getSampleDataForTemplate(meta.key));
    }

    return res.status(200).json({
      success: true,
      data: {
        ...meta,
        isCustomized,
        isCustomCreated: false,
        subject,
        html,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load template" });
  }
};

/**
 * POST /api/email-templates
 * Create a brand new custom template
 */
export const createCustomTemplate = async (req: Request, res: Response) => {
  try {
    const { title, key, category, description, subject, html, bodyHtml, variables } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Template title is required" });
    }

    // Generate sanitized slug key
    const rawKey = key?.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const sanitizedKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!sanitizedKey) {
      return res.status(400).json({ success: false, message: "A valid alphanumeric template key is required" });
    }

    // Check if key already exists in built-in catalog
    if (TEMPLATES_CATALOG.some((t) => t.key.toLowerCase() === sanitizedKey.toLowerCase())) {
      return res.status(400).json({ success: false, message: `A built-in template with key "${sanitizedKey}" already exists` });
    }

    // Check if key already exists in custom templates
    const existing = await SiteSetting.findOne({ key: `email_custom_tpl_${sanitizedKey}` });
    if (existing) {
      return res.status(400).json({ success: false, message: `A custom template with key "${sanitizedKey}" already exists` });
    }

    let templateHtml = html?.trim();
    if (!templateHtml && bodyHtml) {
      templateHtml = wrapBodyInTemplate(bodyHtml, {
        title: title.trim(),
        clubName: "MEC Computer Club",
      });
    } else if (!templateHtml) {
      templateHtml = wrapBodyInTemplate("<p class='body-text'>Enter your email content here...</p>", {
        title: title.trim(),
        clubName: "MEC Computer Club",
      });
    }

    const customTemplateData = {
      key: sanitizedKey,
      title: title.trim(),
      category: category || "custom",
      description: description?.trim() || "Custom user-created template",
      defaultSubject: subject?.trim() || `${title.trim()} - MEC Computer Club`,
      subject: subject?.trim() || `${title.trim()} - MEC Computer Club`,
      html: templateHtml,
      variables: Array.isArray(variables) && variables.length > 0 ? variables : [
        { name: "userName", description: "Recipient full name", sample: "Member Name" },
        { name: "clubName", description: "Club brand name", sample: "MEC Computer Club" },
        { name: "link", description: "Primary action link", sample: "https://meccomputerclub.org" },
      ],
      isCustomCreated: true,
      createdAt: new Date().toISOString(),
    };

    await SiteSetting.create({
      key: `email_custom_tpl_${sanitizedKey}`,
      value: JSON.stringify(customTemplateData),
      label: `Custom Email Template: ${title.trim()}`,
      description: description?.trim() || "Custom user-created template",
    });

    return res.status(201).json({
      success: true,
      message: `Template "${title.trim()}" created successfully`,
      data: {
        ...customTemplateData,
        isCustomized: true,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to create template" });
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

    if (!html || !html.trim()) {
      return res.status(400).json({ success: false, message: "Template HTML cannot be empty" });
    }

    // Check if it's a custom-created template
    const customDoc = await SiteSetting.findOne({ key: `email_custom_tpl_${key}` });
    if (customDoc) {
      try {
        const parsed = JSON.parse(customDoc.value);
        parsed.html = html.trim();
        if (subject?.trim()) parsed.subject = subject.trim();
        parsed.updatedAt = new Date().toISOString();
        customDoc.value = JSON.stringify(parsed);
        await customDoc.save();

        return res.status(200).json({
          success: true,
          message: `Custom template "${parsed.title}" updated successfully`,
        });
      } catch (err: any) {
        // Fall through
      }
    }

    // Otherwise it's a built-in catalog template
    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    const title = meta ? meta.title : key;
    const defaultSubj = meta ? meta.defaultSubject : "MEC Computer Club Notice";

    const payload = JSON.stringify({
      html: html.trim(),
      subject: subject?.trim() || defaultSubj,
      updatedAt: new Date().toISOString(),
    });

    await SiteSetting.findOneAndUpdate(
      { key: `email_tpl_${key}` },
      {
        key: `email_tpl_${key}`,
        value: payload,
        label: `Email Template: ${title}`,
        description: `Customized HTML template for ${title}`,
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Template "${title}" updated successfully`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to update template" });
  }
};

/**
 * DELETE /api/email-templates/:key
 * Delete a user-created custom template
 */
export const deleteCustomTemplate = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    // Check if key is a built-in catalog template
    if (TEMPLATES_CATALOG.some((t) => t.key === key)) {
      return res.status(400).json({
        success: false,
        message: "Built-in system templates cannot be deleted. You can reset them to default instead.",
      });
    }

    const doc = await SiteSetting.findOneAndDelete({ key: `email_custom_tpl_${key}` });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Custom template not found" });
    }

    // Also clean up any overrides
    await SiteSetting.findOneAndDelete({ key: `email_tpl_${key}` });

    return res.status(200).json({
      success: true,
      message: "Custom template deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete template" });
  }
};

/**
 * POST /api/email-templates/:key/reset
 * Reset template to code default
 */
export const resetTemplate = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;

    // Check if it's a custom template
    const isCustom = await SiteSetting.findOne({ key: `email_custom_tpl_${key}` });
    if (isCustom) {
      return res.status(400).json({
        success: false,
        message: "Custom-created templates cannot be reset. You can edit or delete them.",
      });
    }

    await SiteSetting.findOneAndDelete({ key: `email_tpl_${key}` });

    const meta = TEMPLATES_CATALOG.find((t) => t.key === key);
    const defaultHtml = meta ? generateEmail(meta.key as EmailType, getSampleDataForTemplate(meta.key)) : "";

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
        htmlToSend = generateEmail(meta.key as EmailType, getSampleDataForTemplate(meta.key));
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

/**
 * GET /api/email-templates/branding/settings
 * Fetches current global email header banner & footer branding
 */
export const getBrandingSettings = async (req: Request, res: Response) => {
  try {
    const doc = await SiteSetting.findOne({ key: "email_branding_settings" }).lean();
    if (doc && doc.value) {
      try {
        const parsed = JSON.parse(doc.value);
        setGlobalEmailBranding(parsed);
        return res.status(200).json({ success: true, data: parsed });
      } catch {
        // Fall back to default
      }
    }
    return res.status(200).json({ success: true, data: getGlobalEmailBranding() });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load branding settings",
    });
  }
};

/**
 * PUT /api/email-templates/branding/settings
 * Updates global email header banner & footer branding
 */
export const updateBrandingSettings = async (req: Request, res: Response) => {
  try {
    const {
      bannerUrl,
      clubName,
      institutionName,
      footerAddress,
      footerNote,
      websiteUrl,
      contactUrl,
      primaryColor,
      accentColor,
    } = req.body;

    const current = getGlobalEmailBranding();
    const updated: EmailBrandingConfig = {
      bannerUrl: bannerUrl?.trim() || current.bannerUrl,
      clubName: clubName?.trim() || current.clubName,
      institutionName: institutionName?.trim() || current.institutionName,
      footerAddress: footerAddress?.trim() || current.footerAddress,
      footerNote: footerNote !== undefined ? footerNote.trim() : current.footerNote,
      websiteUrl: websiteUrl?.trim() || current.websiteUrl,
      contactUrl: contactUrl?.trim() || current.contactUrl,
      primaryColor: primaryColor?.trim() || current.primaryColor,
      accentColor: accentColor?.trim() || current.accentColor,
    };

    await SiteSetting.findOneAndUpdate(
      { key: "email_branding_settings" },
      {
        key: "email_branding_settings",
        label: "Email Branding & Header/Footer Settings",
        description:
          "Official banner image, club name, footer addresses, and disclaimer across all templates",
        value: JSON.stringify(updated),
      },
      { upsert: true, new: true }
    );

    setGlobalEmailBranding(updated);

    return res.status(200).json({
      success: true,
      message: "Email branding and header/footer updated successfully!",
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update branding settings",
    });
  }
};
