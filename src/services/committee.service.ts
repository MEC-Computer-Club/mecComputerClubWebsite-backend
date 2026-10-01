import Committee, { ICommittee, ICommitteeMember } from "../models/Committee.model";
import Designation from "../models/Designation.model";
import User from "../models/User.model";

/**
 * Seed current 2026-2027 committee if no committee exists yet
 */
export const seedCurrentCommitteeIfEmpty = async () => {
  try {
    const hasCurrent = await Committee.findOne({ term: "2026-2027" });
    if (!hasCurrent) {

    // Fetch active executive designations
    const designations = await Designation.find({ category: "executive" })
      .sort({ order: 1 })
      .lean();

    const titleRegexes = designations.map(
      (d) => new RegExp(`^${d.title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
    );

    const usersWithDesignation = await User.find({
      $or: [{ designation: { $in: titleRegexes } }, { customRole: { $in: titleRegexes } }],
      profileStatus: { $ne: "banned" },
      applicationStatus: "approved",
    })
      .select(
        "_id fullName email imageUrl imagePosition studentId department session batch bio socialLinks designation customRole clubRole"
      )
      .lean();

    const members: ICommitteeMember[] = [];
    const seenUserIds = new Set<string>();

    for (const desig of designations) {
      const matchedUsers = usersWithDesignation.filter(
        (u) =>
          (u.designation && u.designation.toLowerCase() === desig.title.toLowerCase()) ||
          (u.customRole && u.customRole.toLowerCase() === desig.title.toLowerCase())
      );

      for (const u of matchedUsers) {
        const uid = u._id.toString();
        if (seenUserIds.has(uid)) continue;
        seenUserIds.add(uid);

        members.push({
          userId: u._id as any,
          name: u.fullName || "Executive Member",
          role: desig.title,
          order: desig.order ?? 99,
          department: u.department || "CSE",
          batch: u.batch || "",
          session: u.session || "",
          imageUrl: u.imageUrl || "",
          imagePosition: u.imagePosition || "50% 50%",
          socialLinks: {
            facebook: u.socialLinks?.facebook || "",
            linkedin: u.socialLinks?.linkedin || "",
            github: u.socialLinks?.github || "",
            email: u.email || "",
            discord: u.socialLinks?.discord || "",
            codeforces: u.socialLinks?.codeforces || "",
            codechef: u.socialLinks?.codechef || "",
          },
          bio: u.bio || "",
        });
      }
    }

    // Also include any users whose clubRole is executive but not caught above
    const otherExecs = await User.find({
      clubRole: "executive",
      _id: { $nin: Array.from(seenUserIds) },
      profileStatus: { $ne: "banned" },
      applicationStatus: "approved",
    })
      .select(
        "_id fullName email imageUrl imagePosition studentId department session batch bio socialLinks designation customRole clubRole"
      )
      .lean();

    for (const u of otherExecs) {
      members.push({
        userId: u._id as any,
        name: u.fullName || "Executive Member",
        role: u.designation || u.customRole || "Executive Member",
        order: 90,
        department: u.department || "CSE",
        batch: u.batch || "",
        session: u.session || "",
        imageUrl: u.imageUrl || "",
        imagePosition: u.imagePosition || "50% 50%",
        socialLinks: {
          facebook: u.socialLinks?.facebook || "",
          linkedin: u.socialLinks?.linkedin || "",
          github: u.socialLinks?.github || "",
          email: u.email || "",
          discord: u.socialLinks?.discord || "",
          codeforces: u.socialLinks?.codeforces || "",
          codechef: u.socialLinks?.codechef || "",
        },
        bio: u.bio || "",
      });
    }

    // Sort seeded members
    members.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    await Committee.create({
      term: "2026-2027",
      title: "Executive Committee 2026–2027",
      isCurrent: true,
      order: 2026,
      session: "2026-2027",
      description: "Current executive committee driving MEC Computer Club activities, contests, and development.",
      members,
    });

    console.log("Successfully seeded default Executive Committee 2026–2027.");
    }
  } catch (error) {
    console.error("Error seeding default committee:", error);
  }

  try {
    const has2025 = await Committee.findOne({ term: "2025-2026" });
    if (!has2025) {
      await Committee.create({
        term: "2025-2026",
        title: "Executive Committee 2025–2026",
        isCurrent: false,
        order: 2025,
        session: "2025-2026",
        description: "The executive committee that led club workshops, tech seminars, and intra-college programming leagues during the 2025–2026 session.",
        members: [
          {
            name: "Md. Nasir Ahmed",
            role: "President",
            order: 1,
            department: "CSE",
            batch: "CSE-4th",
            session: "2020-21",
            imageUrl: "https://res.cloudinary.com/dj1sjgitq/image/upload/v1790441978/uploads/users_pp/profile-avatar-1790441978170.webp",
            imagePosition: "50% 50%",
            socialLinks: {
              linkedin: "https://www.linkedin.com/in/nasirahmed",
              github: "https://github.com/nasir-dev",
              email: "nasir2242001@gmail.com",
            },
            bio: "Former President • Spearheaded national programming contests and student development.",
          },
          {
            name: "Syed Tanvirul Islam",
            role: "Vice President",
            order: 2,
            department: "CSE",
            batch: "CSE-4th",
            session: "2020-21",
            imageUrl: "",
            imagePosition: "50% 50%",
            socialLinks: {
              linkedin: "https://linkedin.com",
              github: "https://github.com",
            },
            bio: "Vice President (2025-26) • Now Alumnus",
          },
          {
            name: "Tawhid Ahmmed",
            role: "Organizing Secretary",
            order: 5,
            department: "CSE",
            batch: "CSE-5th",
            session: "2021-22",
            imageUrl: "https://res.cloudinary.com/dj1sjgitq/image/upload/v1790441978/uploads/users_pp/profile-avatar-1790441978170.webp",
            imagePosition: "50% 50%",
            socialLinks: {
              facebook: "https://www.facebook.com/abokash89",
              github: "https://github.com/abokash590",
            },
            bio: "Organizing Secretary (2025-26) • Led student logistics & event coordination.",
          },
        ],
      });
      console.log("Successfully seeded archived Executive Committee 2025–2026.");
    }
  } catch (err) {
    console.error("Error seeding archived 2025-2026 committee:", err);
  }
};

/**
 * Synchronize the active Current Committee's roster with all users currently assigned
 * an executive role (clubRole: 'executive') from Executive Roles (DesignationManager).
 * This ensures "Executive Roles" is the single source of truth for the live executive panel,
 * and "Committee Tenures & Archives" remains focused on archival / historical committees.
 */
export const syncCurrentCommitteeFromExecutiveRoles = async () => {
  try {
    let currentCommittee = await Committee.findOne({ isCurrent: true });
    if (!currentCommittee) {
      currentCommittee = await Committee.findOne().sort({ order: -1, createdAt: -1 });
    }
    if (!currentCommittee) return null;

    // Fetch active executive designations sorted by precedence order
    const designations = await Designation.find({ category: "executive" })
      .sort({ order: 1 })
      .lean();

    const orderMap: Record<string, number> = {};
    designations.forEach((d) => {
      orderMap[d.title.trim().toLowerCase()] = d.order ?? 99;
    });

    // Fetch all active, approved executive users
    const execUsers = await User.find({
      clubRole: "executive",
      profileStatus: { $ne: "banned" },
      applicationStatus: "approved",
    }).lean();

    const seenUserIds = new Set<string>();
    const newMembers: ICommitteeMember[] = [];

    // 1. First, preserve any manual/historical members who have NO linked userId
    for (const m of (currentCommittee.members || [])) {
      if (!m.userId) {
        newMembers.push(m);
      }
    }

    // 2. Add all current active executive users ordered by designation precedence
    for (const desig of designations) {
      const matched = execUsers.filter((u) => {
        const des = (u.designation || "").trim().toLowerCase();
        const cust = (u.customRole || "").trim().toLowerCase();
        const target = desig.title.trim().toLowerCase();
        return des === target || cust === target;
      });

      for (const u of matched) {
        const uid = u._id.toString();
        if (seenUserIds.has(uid)) continue;
        seenUserIds.add(uid);

        newMembers.push({
          userId: u._id as any,
          name: u.fullName || "Executive Member",
          role: desig.title,
          order: desig.order ?? 99,
          department: u.department || "CSE",
          batch: u.batch || "",
          session: u.session || "",
          imageUrl: u.imageUrl || "",
          imagePosition: u.imagePosition || "50% 50%",
          socialLinks: {
            facebook: u.socialLinks?.facebook || "",
            linkedin: u.socialLinks?.linkedin || "",
            github: u.socialLinks?.github || "",
            email: u.email || "",
            discord: u.socialLinks?.discord || "",
            codeforces: u.socialLinks?.codeforces || "",
            codechef: u.socialLinks?.codechef || "",
          },
          bio: u.bio || "",
        });
      }
    }

    // 3. Also include any remaining executive users whose role was not in designations
    for (const u of execUsers) {
      const uid = u._id.toString();
      if (seenUserIds.has(uid)) continue;
      seenUserIds.add(uid);

      const role = u.designation || u.customRole || "Executive Member";
      const order = orderMap[role.trim().toLowerCase()] ?? 80;

      newMembers.push({
        userId: u._id as any,
        name: u.fullName || "Executive Member",
        role,
        order,
        department: u.department || "CSE",
        batch: u.batch || "",
        session: u.session || "",
        imageUrl: u.imageUrl || "",
        imagePosition: u.imagePosition || "50% 50%",
        socialLinks: {
          facebook: u.socialLinks?.facebook || "",
          linkedin: u.socialLinks?.linkedin || "",
          github: u.socialLinks?.github || "",
          email: u.email || "",
          discord: u.socialLinks?.discord || "",
          codeforces: u.socialLinks?.codeforces || "",
          codechef: u.socialLinks?.codechef || "",
        },
        bio: u.bio || "",
      });
    }

    // Sort by order ascending
    newMembers.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    currentCommittee.members = newMembers;
    await currentCommittee.save();
    return currentCommittee;
  } catch (err) {
    console.error("Error in syncCurrentCommitteeFromExecutiveRoles:", err);
    return null;
  }
};

/**
 * Get summary list of all committee terms for dropdown / archive selector
 */
export const getCommitteesListService = async () => {
  await seedCurrentCommitteeIfEmpty();
  await syncCurrentCommitteeFromExecutiveRoles();

  const committees = await Committee.find()
    .sort({ order: -1, createdAt: -1 })
    .select("term title isCurrent order session groupPhotoUrl startDate endDate members createdAt updatedAt")
    .lean();

  return committees.map((c) => ({
    _id: c._id,
    term: c.term,
    title: c.title,
    isCurrent: c.isCurrent,
    order: c.order,
    session: c.session,
    groupPhotoUrl: c.groupPhotoUrl,
    startDate: c.startDate,
    endDate: c.endDate,
    memberCount: c.members ? c.members.length : 0,
    createdAt: c.createdAt,
  }));
};

/**
 * Get committee details by term, or default to the current active committee
 */
export const getCommitteeByTermService = async (term?: string) => {
  await seedCurrentCommitteeIfEmpty();

  let query: any = {};
  if (term && term.trim()) {
    query = { term: new RegExp(`^${term.trim()}$`, "i") };
  } else {
    query = { isCurrent: true };
  }

  let committee = await Committee.findOne(query)
    .populate("members.userId", "fullName email imageUrl imagePosition department session batch socialLinks clubRole role profileStatus designation customRole")
    .lean();

  // If this committee is the active current committee, ensure it is freshly synced from Executive Roles
  if (committee && committee.isCurrent) {
    await syncCurrentCommitteeFromExecutiveRoles();
    committee = await Committee.findOne(query)
      .populate("members.userId", "fullName email imageUrl imagePosition department session batch socialLinks clubRole role profileStatus designation customRole")
      .lean();
  }

  // Fallback: If no committee matched isCurrent, take the latest one
  if (!committee) {
    committee = await Committee.findOne()
      .sort({ order: -1, createdAt: -1 })
      .populate("members.userId", "fullName email imageUrl imagePosition department session batch socialLinks clubRole role profileStatus designation customRole")
      .lean();
  }

  if (!committee) {
    return null;
  }

  // Format members: merge live user profile data if userId is connected, otherwise use snapshot data
  const formattedMembers = (committee.members || []).map((m: any) => {
    const user = m.userId && typeof m.userId === "object" ? m.userId : null;

    const liveRole = user?.designation || user?.customRole;
    const isLiveRoleValid = liveRole && liveRole !== "General Member" && liveRole !== "Club Member";
    const effectiveRole =
      (committee?.isCurrent && isLiveRoleValid)
        ? liveRole
        : (m.role || liveRole || "Executive Member");

    return {
      id: user?._id?.toString() || m._id?.toString() || m.userId?.toString(),
      userId: user?._id?.toString() || null,
      name: user?.fullName || m.name || "Member",
      role: effectiveRole,
      order: m.order ?? 99,
      department: user?.department || m.department || "CSE",
      session: user?.session || m.session || "",
      batch: user?.batch || m.batch || "",
      image: user?.imageUrl || m.imageUrl || "",
      imagePosition: user?.imagePosition || m.imagePosition || "50% 50%",
      currentClubRole: user?.clubRole || "member",
      isUserAccountActive: user?.profileStatus === "active",
      socials: {
        facebook: user?.socialLinks?.facebook || m.socialLinks?.facebook || undefined,
        linkedin: user?.socialLinks?.linkedin || m.socialLinks?.linkedin || undefined,
        github: user?.socialLinks?.github || m.socialLinks?.github || undefined,
        discord: user?.socialLinks?.discord || m.socialLinks?.discord || undefined,
        codeforces: user?.socialLinks?.codeforces || m.socialLinks?.codeforces || undefined,
        codechef: user?.socialLinks?.codechef || m.socialLinks?.codechef || undefined,
        email: user?.email || m.socialLinks?.email || undefined,
      },
      bio: m.bio || "",
    };
  });

  // Sort members by hierarchy order
  formattedMembers.sort((a: any, b: any) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  return {
    ...committee,
    members: formattedMembers,
  };
};

/**
 * Create a new committee
 */
export const createCommitteeService = async (data: {
  term: string;
  title: string;
  isCurrent?: boolean;
  order?: number;
  session?: string;
  startDate?: Date;
  endDate?: Date;
  groupPhotoUrl?: string;
  description?: string;
  members?: ICommitteeMember[];
}) => {
  const existing = await Committee.findOne({ term: data.term.trim() });
  if (existing) {
    throw new Error(`Committee for term "${data.term}" already exists.`);
  }

  // Parse order from term if not explicitly set (e.g. "2025-2026" -> 2025)
  let order = data.order;
  if (!order) {
    const match = data.term.match(/\d{4}/);
    order = match ? parseInt(match[0], 10) : 0;
  }

  if (data.isCurrent) {
    // Unset isCurrent from all others
    await Committee.updateMany({}, { $set: { isCurrent: false } });
  }

  const newCommittee = await Committee.create({
    ...data,
    order,
    term: data.term.trim(),
    title: data.title.trim(),
  });

  return newCommittee;
};

/**
 * Update an existing committee
 */
export const updateCommitteeService = async (
  id: string,
  data: Partial<ICommittee>
) => {
  const existing = await Committee.findById(id);
  if (!existing) {
    throw new Error("Committee not found.");
  }

  if (data.term && data.term.trim() !== existing.term) {
    const duplicate = await Committee.findOne({
      term: data.term.trim(),
      _id: { $ne: id },
    });
    if (duplicate) {
      throw new Error(`Committee with term "${data.term}" already exists.`);
    }
  }

  if (data.isCurrent) {
    await Committee.updateMany({ _id: { $ne: id } }, { $set: { isCurrent: false } });
  }

  const updated = await Committee.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  );

  return updated;
};

/**
 * Delete a committee term
 */
export const deleteCommitteeService = async (id: string) => {
  const existing = await Committee.findById(id);
  if (!existing) {
    throw new Error("Committee not found.");
  }

  await Committee.findByIdAndDelete(id);
  return { success: true };
};
