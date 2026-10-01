import { Request, Response, NextFunction } from "express";
import SiteSetting from "../models/SiteSetting.model";

// Default settings seeded when none exist
const DEFAULT_SETTINGS = [
  { key: "club_name", value: "MEC Computer Club", label: "Club Name", description: "Official name displayed site-wide." },
  { key: "club_tagline", value: "Learn. Build. Share.", label: "Club Tagline", description: "Short tagline shown in the hero section." },
  { key: "founded_year", value: "2015", label: "Founded Year", description: "Year the club was founded." },
  { key: "membership_fee", value: "500", label: "Membership Fee (BDT)", description: "Annual membership fee in BDT." },
  { key: "address", value: "Department of CSE, Mymensingh Engineering College, Khagdahar, Mymensingh-2200", label: "Club Address", description: "Physical address of the club." },
  { key: "contact_email", value: "meccomputerclub@gmail.com", label: "Contact Email", description: "Primary contact email shown on the website." },
  { key: "contact_phone", value: "+8801780667954", label: "Contact Phone", description: "Primary phone number shown on the website." },
  { key: "whatsapp_number", value: "8801780667954", label: "WhatsApp Number", description: "WhatsApp number (digits only, no +)." },
  { key: "facebook_url", value: "https://www.facebook.com/mec.programmingclub", label: "Facebook URL", description: "Club Facebook page URL." },
  { key: "linkedin_url", value: "https://www.linkedin.com/in/mec-computer-club/", label: "LinkedIn URL", description: "Club LinkedIn page URL." },
  { key: "youtube_url", value: "https://www.youtube.com/@MECComputerClub", label: "YouTube URL", description: "Club YouTube channel URL." },
  { key: "github_url", value: "https://github.com", label: "GitHub URL", description: "Club GitHub organization URL." },
  // Batch settings — current most-junior (smallest) batch number per department.
  // The registration form shows the last 10 batches up to this number.
  { key: "batch_current_CSE", value: "6", label: "CSE — Current Junior Batch No.", description: "The most junior (latest) CSE batch number. Registration form shows the last 10 batches up to this number (e.g., 6 shows 1st–6th Batch)." },
  { key: "batch_current_EEE", value: "14", label: "EEE — Current Junior Batch No.", description: "The most junior (latest) EEE batch number. Registration form shows the last 10 batches up to this number." },
  { key: "batch_current_CE", value: "8", label: "CE — Current Junior Batch No.", description: "The most junior (latest) CE batch number. Registration form shows the last 10 batches up to this number." },
  // Club Room status
  { key: "club_room_status", value: "closed", label: "Club Room Status", description: "Current status of the club room ('open' or 'closed')." },
  { key: "club_room_opened_by", value: "", label: "Club Room Opened By", description: "Name of the person who opened the club room." },
  { key: "club_room_updated_at", value: "", label: "Club Room Last Updated", description: "Timestamp of last room status change." },
];


export const getSiteSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Delete legacy office_hours if it exists
    await SiteSetting.deleteMany({ key: "office_hours" });

    let settings = await SiteSetting.find().sort({ key: 1 }).lean();

    // Ensure all default settings exist
    const existingKeys = new Set(settings.map((s) => s.key));
    const missingDefaults = DEFAULT_SETTINGS.filter((d) => !existingKeys.has(d.key));
    if (missingDefaults.length > 0) {
      await SiteSetting.insertMany(missingDefaults);
      settings = await SiteSetting.find().sort({ key: 1 }).lean();
    }

    // Filter out office_hours just in case
    settings = settings.filter((s) => s.key !== "office_hours");

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Public endpoint — returns batch settings & public site settings (no auth required)
 * @route GET /api/site-settings/public
 */
export const getPublicBatchSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Clean up legacy office_hours
    await SiteSetting.deleteMany({ key: "office_hours" });

    let allSettings = await SiteSetting.find().lean();

    // If any defaults are missing, insert them
    const existingKeys = new Set(allSettings.map((s) => s.key));
    const missingDefaults = DEFAULT_SETTINGS.filter((d) => !existingKeys.has(d.key));
    if (missingDefaults.length > 0) {
      await SiteSetting.insertMany(missingDefaults);
      allSettings = await SiteSetting.find().lean();
    }

    // Build batchMap for existing components expecting { CSE: 6, EEE: 14, CE: 8 }
    const batchMap: Record<string, number> = { CSE: 6, EEE: 14, CE: 8 };
    const settingsMap: Record<string, string> = {};

    for (const s of allSettings) {
      if (s.key === "office_hours") continue;
      if (s.key.startsWith("batch_current_")) {
        const dept = s.key.replace("batch_current_", "");
        batchMap[dept] = parseInt(s.value) || 1;
      }
      settingsMap[s.key] = s.value;
    }

    // Also ensure DEFAULT_SETTINGS fallback values in settingsMap
    for (const d of DEFAULT_SETTINGS) {
      if (!settingsMap[d.key]) {
        settingsMap[d.key] = d.value;
      }
    }

    const clubRoom = {
      status: settingsMap["club_room_status"] === "open" ? "open" : "closed",
      openedBy: settingsMap["club_room_opened_by"] || "",
      updatedAt: settingsMap["club_room_updated_at"] || "",
    };

    res.status(200).json({
      success: true,
      data: batchMap,
      batches: batchMap,
      settings: settingsMap,
      clubRoom,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Update club room status (open / closed)
 * @route PATCH /api/site-settings/club-room
 */
export const updateClubRoomStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!status || (status !== "open" && status !== "closed")) {
      return res.status(400).json({ success: false, message: "Status must be 'open' or 'closed'" });
    }

    const user = (req as any).user;
    const openedBy = status === "open" ? (user?.fullName || user?.name || "Club Executive") : "";
    const updatedAt = new Date().toISOString();

    await Promise.all([
      SiteSetting.findOneAndUpdate(
        { key: "club_room_status" },
        { value: status, label: "Club Room Status", description: "Current status of the club room ('open' or 'closed')." },
        { upsert: true, new: true }
      ),
      SiteSetting.findOneAndUpdate(
        { key: "club_room_opened_by" },
        { value: openedBy, label: "Club Room Opened By", description: "Name of the person who opened the club room." },
        { upsert: true, new: true }
      ),
      SiteSetting.findOneAndUpdate(
        { key: "club_room_updated_at" },
        { value: updatedAt, label: "Club Room Last Updated", description: "Timestamp of last room status change." },
        { upsert: true, new: true }
      ),
    ]);

    res.status(200).json({
      success: true,
      message: `Club room is now ${status}`,
      clubRoom: {
        status,
        openedBy,
        updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * @desc  Bulk update site settings (admin)
 * @route PUT /api/site-settings
 */
export const updateSiteSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = req.body as {
      settings: Array<{ key: string; value: string; label: string; description?: string }>;
    };

    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ success: false, message: "settings array is required." });
    }

    // Upsert each setting by key (ignoring removed office_hours)
    const ops = settings
      .filter((s) => s.key !== "office_hours")
      .map((s) => ({
        updateOne: {
          filter: { key: s.key },
          update: { $set: { value: s.value, label: s.label, description: s.description } },
          upsert: true,
        },
      }));

    if (ops.length > 0) {
      await SiteSetting.bulkWrite(ops);
    }

    let updated = await SiteSetting.find().sort({ key: 1 }).lean();
    updated = updated.filter((s) => s.key !== "office_hours");
    res.status(200).json({ success: true, message: "Settings updated successfully.", data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc  Create or upsert a single setting (admin)
 * @route POST /api/site-settings
 */
export const upsertSiteSetting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, value, label, description } = req.body;

    if (!key || !label) {
      return res.status(400).json({ success: false, message: "key and label are required." });
    }

    const setting = await SiteSetting.findOneAndUpdate(
      { key },
      { $set: { value, label, description } },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: setting });
  } catch (error) {
    next(error);
  }
};
