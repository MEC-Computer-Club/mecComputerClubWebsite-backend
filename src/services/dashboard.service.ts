// src/services/dashboard.service.ts
import User from "../models/User.model"; // Assuming this model exists
import { Event } from "../models/Event.model"; // Assuming this model exists
import { Certificate } from "../models/Certificate.model"; // Assuming this model exists
import { Sponsor } from "../models/Sponsor.model"; // Assuming this model exists
import { Project } from "../models/Project.model"; // Assuming this model exists
import { Asset } from "../models/Asset.model"; // Assuming this model exists
import { DashboardStats } from "../types/dashboard.types";
import { generateEmail } from "../utils/generateEmailTemplate";
import { sendEmail } from "../utils/sendEmail";
import { createNotification } from "./notification.service";
// Note: You would import the actual models and types here

// --- MEMBER DASHBOARD SERVICE ---
export const getMemberDashboardData = async (userId: string) => {
  try {
    const member = await User.findById(userId)
      .select("profileStatus eventsAttended certificates projectsContributed")
      .populate({
        path: "eventsAttended",
        select: "name date location",
      })
      .populate({
        path: "certificates",
        select: "name issueDate",
      })
      .populate({
        path: "projectsContributed",
        select: "name status",
      })
      .lean(); // .lean() for faster query results

    if (!member) {
      throw new Error("Member not found.");
    }

    return {
      eventsAttended: member?.eventsAttended?.length || 0,
      certificatesEarned: member?.certificates?.length || 0,
      projectsContributed: member?.projectsContributed?.length || 0,
      profileStatus: member.profileStatus,
    };
  } catch (error) {
    console.error("Error fetching member dashboard data:", error);
    throw new Error("Could not retrieve member dashboard data.");
  }
};

export const getAdminDashboardStats = async (): Promise<DashboardStats> => {
  try {
    // Parallel queries for speed - Keep the Promise.all structure
    const [
      totalMembers,
      totalActiveMembers,
      totalAlumni,
      pendingApplications,
      totalEvents,
      upcomingEvents,
      totalCertificates,
      totalProjects,
      totalSponsors,
      activeSponsors,
      totalAssets,
    ] = await Promise.all([
      // 1. Membership Queries
      User.countDocuments(),
      User.countDocuments({ role: { $nin: ["alumni", "guest"] }, profileStatus: "active" }),
      User.countDocuments({ role: "alumni" }),
      User.countDocuments({ applicationStatus: "pending" }),

      // 2. Activity & Content Queries
      Event.countDocuments(),
      Event.countDocuments({ date: { $gte: new Date() } }),
      Certificate.countDocuments(),
      Project.countDocuments(),

      // 3. Financial & Asset Queries
      Sponsor.countDocuments(),
      Sponsor.countDocuments({ isActive: true }), // Assuming an isActive field
      Asset.countDocuments(),
    ]);

    return {
      membership: {
        totalMembers: totalMembers,
        totalActiveMembers: totalActiveMembers,
        totalAlumni: totalAlumni,
        pendingApplications: pendingApplications,
      },
      activities: {
        totalEvents: totalEvents,
        upcomingEvents: upcomingEvents,
        totalCertificates: totalCertificates,
        totalProjects: totalProjects,
      },
      resources: {
        totalSponsors: totalSponsors,
        activeSponsors: activeSponsors,
        totalAssets: totalAssets,
      },
    } as DashboardStats; // Explicitly cast the return value
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    // You can throw a more descriptive error or use a standardized error class
    throw new Error("Could not retrieve admin dashboard stats.");
  }
};

export interface GetMembersParams {
  tab?: "pending" | "all";
  filter?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const getMembersDataService = async (params: GetMembersParams = {}) => {
  try {
    const {
      tab = "pending",
      filter = "all",
      search = "",
      page = 1,
      limit = 10,
    } = params;

    const query: Record<string, any> = {};

    // 1. Tab & Filter logic based on clubRole & application/profile statuses
    if (tab === "pending") {
      if (filter === "rejected") {
        query.applicationStatus = "rejected";
      } else if (filter === "all_applications") {
        query.applicationStatus = { $in: ["pending", "rejected"] };
      } else {
        // default for pending tab
        query.applicationStatus = "pending";
      }
    } else {
      // tab === "all"
      if (filter === "banned") {
        query.profileStatus = "banned";
      } else if (filter === "incomplete") {
        query.profileStatus = "incomplete";
        query.applicationStatus = { $ne: "pending" };
      } else if (filter === "all" || !filter) {
        query.applicationStatus = { $ne: "pending" };
      } else {
        // filter by clubRole: "member" | "executive" | "alumni" | "advisor"
        query.applicationStatus = { $ne: "pending" };
        query.clubRole = filter;
      }
    }

    // 2. Search logic (fullName, studentId, email)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { fullName: searchRegex },
        { studentId: searchRegex },
        { email: searchRegex },
      ];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [members, total, countsData] = await Promise.all([
      User.find(query)
        .select(
          "_id fullName imageUrl imagePosition email role clubRole customRole designation applicationStatus profileStatus studentId department session batch contactNumber address bio socialLinks isGraduated passingYear eventsAttended certificates projectsContributed createdAt approvedAt approvedBy rejectionReason"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
      Promise.all([
        User.countDocuments({ applicationStatus: "pending" }),
        User.countDocuments({ applicationStatus: { $ne: "pending" } }),
        User.countDocuments({ applicationStatus: "rejected" }),
        User.countDocuments({ applicationStatus: { $ne: "pending" }, clubRole: "member" }),
        User.countDocuments({ applicationStatus: { $ne: "pending" }, clubRole: "executive" }),
        User.countDocuments({ applicationStatus: { $ne: "pending" }, clubRole: "alumni" }),
        User.countDocuments({ applicationStatus: { $ne: "pending" }, clubRole: "advisor" }),
        User.countDocuments({ profileStatus: "banned" }),
      ]),
    ]);

    const [
      pendingCount,
      allCount,
      rejectedCount,
      membersCount,
      executiveCount,
      alumniCount,
      advisorCount,
      bannedCount,
    ] = countsData;

    // Map to a new array and attach activityCounts
    const membersWithCounts = (members as any[]).map((member) => {
      const { eventsAttended, certificates, projectsContributed, ...rest } = member;
      const activityCounts =
        (eventsAttended?.length || 0) +
        (certificates?.length || 0) +
        (projectsContributed?.length || 0);

      return {
        ...rest,
        activityCounts,
      };
    });

    return {
      members: membersWithCounts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      counts: {
        pending: pendingCount,
        all: allCount,
        rejected: rejectedCount,
        member: membersCount,
        executive: executiveCount,
        alumni: alumniCount,
        advisor: advisorCount,
        banned: bannedCount,
      },
    };
  } catch (error) {
    console.error("Error fetching members data:", error);
    throw new Error("Could not retrieve members data.");
  }
};

export const getApplicationByIdService = async (userId: string) => {
  try {
    const user = await User.findById(userId)
      .select("-password -verificationCode -verificationToken -passwordResetToken -passwordResetCode")
      .populate("approvedBy", "fullName email imageUrl")
      .lean();

    if (!user) {
      throw new Error("Applicant not found");
    }

    return user;
  } catch (error: any) {
    console.error("Error fetching applicant details:", error);
    throw new Error(error?.message || "Could not retrieve applicant details.");
  }
};

export const approveOrRejectUser = async (
  adminId: string,
  userId: string,
  status: string,
  reason?: string
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const approved = status === "approved";

  if (approved) {
    user.applicationStatus = "approved";
    user.approvedBy = adminId as any;
    user.approvedAt = new Date();
    // if approved and graduated, set role=alumni, otherwise member (preserves admin, moderator, executive)
    if (user.role === "guest") {
      user.role = user.isGraduated ? "alumni" : "member";
    } else if (user.isGraduated && user.role === "member") {
      user.role = "alumni";
    }
    await user.save();

    // notify user via email
    const emailTemplate = generateEmail("status", { userName: user.fullName, status: "Approved" });
    await sendEmail(user.email, "Your MEC Club membership was approved", emailTemplate);

    // dispatch in-app notification
    createNotification({
      recipient: user._id,
      type: "approval",
      title: "Membership Approved! 🎉",
      message: "Congratulations! Your MEC Computer Club membership application has been approved. Welcome aboard!",
      link: "/dashboard",
      actionLabel: "Access Dashboard",
      priority: "high",
    }).catch((err) => console.error("Notification creation error:", err));

    return user;
  } else {
    user.applicationStatus = "rejected";
    user.rejectionReason = reason || "Rejected by admin";
    user.approvedBy = adminId as any;
    user.approvedAt = new Date();
    await user.save();

    const emailTemplate = generateEmail("status", { userName: user.fullName, status: "Rejected" });
    await sendEmail(user.email, "Your MEC Club application was rejected", emailTemplate);

    // dispatch in-app notification
    createNotification({
      recipient: user._id,
      type: "approval",
      title: "Membership Application Update",
      message: `Your application was reviewed: ${user.rejectionReason}`,
      link: "/profile",
      actionLabel: "View Details",
      priority: "normal",
    }).catch((err) => console.error("Notification creation error:", err));

    return user;
  }
};
