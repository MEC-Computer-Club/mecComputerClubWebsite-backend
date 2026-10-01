import Designation, { IDesignation } from "../models/Designation.model";
import User from "../models/User.model";
import { syncCurrentCommitteeFromExecutiveRoles } from "./committee.service";

const DEFAULT_EXECUTIVE_ROLES = [
  { title: "President", order: 1, defaultRole: "admin", maxSeats: 1 },
  { title: "Vice President", order: 2, defaultRole: "admin", maxSeats: 2 },
  { title: "General Secretary", order: 3, defaultRole: "admin", maxSeats: 1 },
  { title: "Joint Secretary", order: 4, defaultRole: "moderator", maxSeats: 2 },
  { title: "Organizing Secretary", order: 5, defaultRole: "moderator", maxSeats: 2 },
  { title: "Creative & Media Executive", order: 6, defaultRole: "moderator" },
  { title: "Event Co-Ordinator", order: 7, defaultRole: "moderator" },
  { title: "Finance Secretary", order: 8, defaultRole: "moderator", maxSeats: 1 },
  { title: "Resource & Logistics Manager", order: 9, defaultRole: "moderator" },
  { title: "Public Relations Executive", order: 10, defaultRole: "moderator" },
  { title: "Web Administrator", order: 11, defaultRole: "admin" },
  { title: "Competitive Programming Lead", order: 12, defaultRole: "moderator" },
  { title: "Web Development Lead", order: 13, defaultRole: "moderator" },
  { title: "AI & ML Lead", order: 14, defaultRole: "moderator" },
  { title: "Cybersecurity Lead", order: 15, defaultRole: "moderator" },
  { title: "Executive Member", order: 16, defaultRole: "member" },
];

const DEFAULT_ADVISOR_ROLES = [
  { title: "Chief Patron & Principal", order: 1, defaultRole: "member", maxSeats: 1 },
  { title: "Chief Advisor", order: 2, defaultRole: "member", maxSeats: 1 },
  { title: "Technical Advisor", order: 3, defaultRole: "member" },
  { title: "Faculty Advisor", order: 4, defaultRole: "member" },
  { title: "Honorary Mentor", order: 5, defaultRole: "member" },
];

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const seedDefaultDesignationsIfEmpty = async () => {
  try {
    const count = await Designation.countDocuments();
    if (count === 0) {
      const execItems = DEFAULT_EXECUTIVE_ROLES.map((r) => ({
        ...r,
        slug: generateSlug(r.title),
        category: "executive",
        isActive: true,
      }));
      const advisorItems = DEFAULT_ADVISOR_ROLES.map((r) => ({
        ...r,
        slug: generateSlug(r.title),
        category: "advisor",
        isActive: true,
      }));
      await Designation.insertMany([...execItems, ...advisorItems]);
      console.log("Successfully seeded default designations (Executive & Advisor roles).");
    }
  } catch (error) {
    console.error("Error seeding default designations:", error);
  }
};

export const getDesignationsService = async (category?: string) => {
  await seedDefaultDesignationsIfEmpty();

  const filter: any = { isActive: true };
  if (category && ["executive", "advisor", "general", "alumni"].includes(category)) {
    filter.category = category;
  }

  const designations = await Designation.find(filter).sort({ order: 1, createdAt: 1 }).lean();

  // Attach currently assigned members count and list (include socialLinks, imagePosition, batch; exclude platform role)
  const titleRegexes = designations.map((d) => new RegExp(`^${d.title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
  const assignedUsers = await User.find({
    applicationStatus: "approved",
    $or: [{ designation: { $in: titleRegexes } }, { customRole: { $in: titleRegexes } }],
  })
    .select("_id fullName email imageUrl imagePosition studentId department session batch bio socialLinks designation customRole clubRole")
    .lean();

  const designationsWithMembers = designations.map((desig) => {
    const members = assignedUsers.filter(
      (u) =>
        (u.designation && u.designation.toLowerCase() === desig.title.toLowerCase()) ||
        (u.customRole && u.customRole.toLowerCase() === desig.title.toLowerCase())
    );
    return {
      ...desig,
      assignedCount: members.length,
      assignedMembers: members,
    };
  });

  return designationsWithMembers;
};

export const createDesignationService = async (data: {
  title: string;
  category: "executive" | "advisor" | "general" | "alumni";
  order?: number;
  maxSeats?: number;
  defaultRole?: "admin" | "moderator" | "member";
}) => {
  const slug = generateSlug(data.title);

  // If order not provided, place at end of category
  let order = data.order;
  if (!order) {
    const highestOrder = await Designation.findOne({ category: data.category }).sort({ order: -1 });
    order = highestOrder ? highestOrder.order + 1 : 1;
  }

  const newDesignation = await Designation.create({
    title: data.title.trim(),
    slug,
    category: data.category || "executive",
    order,
    maxSeats: data.maxSeats || null,
    defaultRole: data.defaultRole || "member",
    isActive: true,
  });

  return newDesignation;
};

export const updateDesignationService = async (
  id: string,
  updateData: {
    title?: string;
    order?: number;
    maxSeats?: number;
    defaultRole?: "admin" | "moderator" | "member";
    isActive?: boolean;
  }
) => {
  const existing = await Designation.findById(id);
  if (!existing) {
    throw new Error("Designation not found");
  }

  const oldTitle = existing.title;
  if (updateData.title && updateData.title.trim() !== oldTitle) {
    const newTitle = updateData.title.trim();
    existing.title = newTitle;
    existing.slug = generateSlug(newTitle);

    // Also update any users holding this old title
    await User.updateMany(
      { designation: oldTitle },
      { $set: { designation: newTitle } }
    );
  }

  if (updateData.order !== undefined) existing.order = updateData.order;
  if (updateData.maxSeats !== undefined) existing.maxSeats = updateData.maxSeats;
  if (updateData.defaultRole !== undefined) existing.defaultRole = updateData.defaultRole;
  if (updateData.isActive !== undefined) existing.isActive = updateData.isActive;

  await existing.save();
  return existing;
};

export const reorderDesignationsService = async (
  items: { id: string; order: number }[]
) => {
  const bulkOps = items.map((item) => ({
    updateOne: {
      filter: { _id: item.id },
      update: { $set: { order: item.order } },
    },
  }));

  if (bulkOps.length > 0) {
    await Designation.bulkWrite(bulkOps);
    await syncCurrentCommitteeFromExecutiveRoles();
  }

  return { success: true, count: bulkOps.length };
};

export const deleteDesignationService = async (id: string) => {
  const existing = await Designation.findById(id);
  if (!existing) {
    throw new Error("Designation not found");
  }

  // Clear designation on users holding this title
  await User.updateMany(
    {
      $or: [{ designation: existing.title }, { customRole: existing.title }],
    },
    {
      $set: {
        designation: "General Member",
        clubRole: "member",
      },
    }
  );

  await Designation.findByIdAndDelete(id);
  await syncCurrentCommitteeFromExecutiveRoles();
  return { success: true, deletedId: id };
};

export const assignMembersToDesignationService = async (
  designationTitle: string,
  category: "executive" | "advisor",
  memberIds: string[],
  defaultRole?: "admin" | "moderator" | "member"
) => {
  const escapedTitle = designationTitle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titleRegex = new RegExp(`^${escapedTitle}$`, "i");

  // First, find all members currently having this designation
  const currentMembers = await User.find({
    $or: [{ designation: titleRegex }, { customRole: titleRegex }],
  }).select("_id");

  const currentIds = currentMembers.map((m) => m._id.toString());
  const newIds = memberIds.map((id) => id.toString());

  // Members to remove from this role
  const toRemove = currentIds.filter((id) => !newIds.includes(id));
  if (toRemove.length > 0) {
    await User.updateMany(
      { _id: { $in: toRemove } },
      {
        $set: {
          designation: "General Member",
          customRole: "General Member",
          clubRole: "member",
        },
      }
    );
  }

  // Members to add/set to this role
  if (newIds.length > 0) {
    const updatePayload: any = {
      designation: designationTitle,
      customRole: designationTitle,
      clubRole: category === "advisor" ? "advisor" : "executive",
    };

    if (defaultRole && defaultRole !== "member") {
      updatePayload.role = defaultRole;
    }

    await User.updateMany({ _id: { $in: newIds } }, { $set: updatePayload });
  }

  if (category === "executive") {
    await syncCurrentCommitteeFromExecutiveRoles();
  }

  return { success: true, assignedCount: newIds.length, unassignedCount: toRemove.length };
};
