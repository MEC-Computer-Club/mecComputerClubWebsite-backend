import { Request, Response, NextFunction } from "express";
import { PageContent } from "../models/PageContent.model";

const DEFAULT_PAGE_CONTENTS: Record<string, any> = {
  home: {
    hero: {
      title: "Debug your limits. Build reality.",
      highlightText: "Welcome to the Club.",
      description:
        "MEC Computer Club is where students compete in ICPC, build production software, and grow as developers — not just attend meetings.",
      ctaText: "Become a Member",
      ctaLink: "/join",
    },
    stats: {
      members: "70+",
      segments: "5+",
      events: "12+",
    },
    techTreeEvents: {
      cp: "8+ EVENTS",
      webdev: "5+ EVENTS",
      ml: "3+ EVENTS",
      cybersec: "3+ EVENTS",
      gaming: "3+ EVENTS",
    },
    contact: {
      email: "meccomputerclub@gmail.com",
      presidentPhone: "01773-758374",
      generalSecretaryPhone: "01568985672",
      location:
        "Department of CSE, Mymensingh Engineering College, Khagdahar, Mymensingh-2200",
    },
    announcement: {
      enabled: false,
      badge: "Notice",
      text: "Intra-MEC Programming Contest 2026 pre-registration is now open!",
      link: "/events",
    },
  },
  "cp-hub": {
    header: {
      kicker: "Competitive Programming",
      title: "CP Hub",
      description:
        "Leaderboard, curated roadmaps, problem sets, and resources — everything the CP team needs in one place.",
    },
    achievements: [],
    clubDocs: [],
  },
  contact: {
    info: {
      email: "meccomputerclub@gmail.com",
      presidentPhone: "01773-758374",
      generalSecretaryPhone: "01568985672",
      location:
        "Department of CSE, Mymensingh Engineering College, Khagdahar, Mymensingh-2200",
    },
  },
  about: {
    hero: {
      kicker: "About us",
      title: "Hello World! Meet the Club",
      description:
        'MEC Computer Club exists to give students a structured path from "I\'m interested in CS" to "I\'ve shipped real projects, competed at ICPC, and have something concrete to show for it."',
      subDescription:
        "Founded in 2019, the club started as a small competitive programming group. Today, 70+ members work across specialized departments — Competitive Programming, Web Development, Machine Learning, and Cybersecurity. We run weekly practice sessions, build internal tools, host contests, and send teams to national and regional competitions.",
    },
    departments: {
      sectionKicker: "Departments",
      sectionTitle: "Your Core Functions & Tasks",
      sectionDescription:
        "Each department runs its own activities, projects, and learning tracks.",
      memberCounts: {
        cp: 24,
        webdev: 18,
        ml: 15,
        cybersec: 12,
        gaming: 20,
      },
    },
    milestones: [
      {
        year: "2019",
        title: "Founded",
        description:
          "Started as a CP study group with 12 members and a shared Google Sheet.",
      },
      {
        year: "2020",
        title: "First ICPC participation",
        description:
          "Sent our first team to ICPC Asia Dhaka Regional. Didn't place, but learned everything.",
      },
      {
        year: "2022",
        title: "Expanded to 4 departments",
        description:
          "Added Web Dev, ML/AI, and Cybersecurity panels. Membership grew to 40+.",
      },
      {
        year: "2024",
        title: "Built MEC Judge",
        description:
          "Launched our own online judge platform. 80+ students used it in the first contest.",
      },
      {
        year: "2025",
        title: "70+ members, 3 ICPC teams",
        description:
          "Largest year yet. Shipping projects, running workshops, and sending 3 teams to ICPC.",
      },
    ],
  },
  sponsor: {
    hero: {
      kicker: "Corporate Sponsorship",
      title: "Acquire Top Tech Talent",
      description:
        "150+ active members. Trusted by 15+ companies to deliver battle-tested engineering students before they hit the job market.",
      deckButtonText: "Get the Pitch Deck",
      tiersButtonText: "View Sponsorship Tiers",
    },
    stats: {
      stat1Value: "150+",
      stat1Label: "Active Members",
      stat2Value: "20+",
      stat2Label: "Yearly Events",
      stat3Value: "500+",
      stat3Label: "Participants",
      stat4Value: "15+",
      stat4Label: "Sponsors",
    },
    cta: {
      cycleNotice: "Sponsorship cycle closes Nov 30",
      title: "Ready to collaborate?",
      emailButtonText: "Email Us",
      callButtonText: "Call Us",
    },
  },
};

/**
 * @desc  Get content for a page (Public)
 * @route GET /api/page-content/:page
 */
export const getPageContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageKey = (req.params.page || "").toLowerCase().trim();
    if (!pageKey) {
      return res.status(400).json({ success: false, message: "Page key is required" });
    }

    let doc: any = await PageContent.findOne({ page: pageKey }).lean();

    // If none exists, seed default if available
    if (!doc) {
      const defaultSections = DEFAULT_PAGE_CONTENTS[pageKey] || {};
      const newDoc = await PageContent.create({
        page: pageKey,
        sections: defaultSections,
      });
      doc = newDoc.toObject();
    }

    res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Update content for a page (Admin / Moderator)
 * @route PUT /api/page-content/:page
 */
export const updatePageContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageKey = (req.params.page || "").toLowerCase().trim();
    if (!pageKey) {
      return res.status(400).json({ success: false, message: "Page key is required" });
    }

    const { sections } = req.body;
    if (!sections || typeof sections !== "object") {
      return res.status(400).json({ success: false, message: "Sections object is required" });
    }

    const userId = (req as any).user?.id || (req as any).user?._id;

    const updated = await PageContent.findOneAndUpdate(
      { page: pageKey },
      {
        $set: {
          sections,
          updatedBy: userId,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: `Content for ${pageKey} updated successfully`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
