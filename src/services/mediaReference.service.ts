import mongoose from "mongoose";
import { connectDB } from "../config/db.config";
import User from "../models/User.model";
import { Event } from "../models/Event.model";
import { Blog } from "../models/Blog.model";
import Form from "../models/Form.model";
import { Project } from "../models/Project.model";
import { Sponsor } from "../models/Sponsor.model";
import { CoverPresetModel } from "../models/CoverPreset.model";
import { Media } from "../models/Media.model";
import { CertificateTemplate } from "../models/CertificateTemplate.model";
import { Certificate } from "../models/Certificate.model";

export interface MediaEntityReference {
  type: "user" | "event" | "blog" | "form" | "project" | "sponsor" | "cover_preset" | "media_gallery" | "certificate";
  id: string;
  title: string;
  usage: string;
  dashboardUrl?: string;
  publicUrl?: string;
}

/**
 * Normalizes any Cloudinary URL or publicId into a lookup key (clean basename without file extension).
 */
export function normalizeMediaKey(input?: string): string {
  if (!input) return "";
  try {
    let clean = input.trim();
    // If full URL, take pathname
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      const url = new URL(clean);
      clean = url.pathname;
    }
    // Remove /image/upload/v[0-9]+/ or /upload/
    clean = clean.replace(/.*\/(?:image|video|raw)\/upload\/(?:v\d+\/)?/, "");
    clean = clean.replace(/.*\/upload\/(?:v\d+\/)?/, "");
    // Remove leading slash if any
    clean = clean.replace(/^\/+/, "");
    // Remove query params or hash
    clean = clean.split("?")[0].split("#")[0];
    // Remove file extension
    clean = clean.replace(/\.[^/.]+$/, "");
    return clean.toLowerCase();
  } catch {
    return (input || "").toLowerCase().replace(/^\/+/, "").replace(/\.[^/.]+$/, "");
  }
}

/**
 * Scans all collections in MongoDB to discover all active media references.
 * Returns a lookup Map keyed by normalized publicId and basename.
 */
export async function getDatabaseMediaReferences(): Promise<{
  referenceMap: Map<string, MediaEntityReference[]>;
  stats: {
    totalEntitiesWithMedia: number;
    breakdown: {
      users: number;
      events: number;
      blogs: number;
      forms: number;
      projects: number;
      sponsors: number;
      presets: number;
      gallery: number;
      certificates: number;
    };
  };
}> {
  const referenceMap = new Map<string, MediaEntityReference[]>();

  const addRef = (rawKey: string | undefined, ref: MediaEntityReference) => {
    if (!rawKey) return;
    const normalized = normalizeMediaKey(rawKey);
    if (!normalized) return;

    // Index by full normalized path (e.g. "uploads/users_pp/fida-zaman-123")
    const existing = referenceMap.get(normalized) || [];
    if (!existing.some((e) => e.type === ref.type && e.id === ref.id && e.usage === ref.usage)) {
      existing.push(ref);
      referenceMap.set(normalized, existing);
    }

    // Also index by basename (e.g. "fida-zaman-123") in case folder differs or changed
    const baseName = normalized.split("/").pop();
    if (baseName && baseName !== normalized) {
      const existingBase = referenceMap.get(baseName) || [];
      if (!existingBase.some((e) => e.type === ref.type && e.id === ref.id && e.usage === ref.usage)) {
        existingBase.push(ref);
        referenceMap.set(baseName, existingBase);
      }
    }
  };

  try {
    await connectDB();
  } catch (dbErr) {
    console.warn("[MediaReference] Failed to ensure database connection:", dbErr);
  }

  let userCount = 0;
  let eventCount = 0;
  let blogCount = 0;
  let formCount = 0;
  let projectCount = 0;
  let sponsorCount = 0;
  let presetCount = 0;
  let galleryCount = 0;
  let certCount = 0;

  // 1. Users
  try {
    const users = await User.find(
      {},
      "fullName email role imageUrl coverUrl imagePublicId coverPublicId"
    ).lean().exec();

    users.forEach((u: any) => {
      let hasMedia = false;
      if (u.imageUrl || u.imagePublicId) {
        hasMedia = true;
        addRef(u.imagePublicId || u.imageUrl, {
          type: "user",
          id: String(u._id),
          title: u.fullName || u.email || "Member",
          usage: "Profile Avatar",
          dashboardUrl: `/dashboard/members/${u._id}`,
          publicUrl: `/profile/${u._id}`,
        });
      }
      if (u.coverUrl || u.coverPublicId) {
        hasMedia = true;
        addRef(u.coverPublicId || u.coverUrl, {
          type: "user",
          id: String(u._id),
          title: u.fullName || u.email || "Member",
          usage: "Profile Cover Photo",
          dashboardUrl: `/dashboard/members/${u._id}`,
          publicUrl: `/profile/${u._id}`,
        });
      }
      if (hasMedia) userCount++;
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning users:", err);
  }

  // 2. Events
  try {
    const events = await Event.find(
      {},
      "title slug coverImageUrl bannerImageUrl contributors"
    ).lean().exec();

    events.forEach((e: any) => {
      let hasMedia = false;
      if (e.coverImageUrl) {
        hasMedia = true;
        addRef(e.coverImageUrl, {
          type: "event",
          id: String(e._id),
          title: e.title,
          usage: "Event Cover Image",
          dashboardUrl: `/dashboard/manage-events/event-detail/${e._id}`,
          publicUrl: `/events/${e.slug || e._id}`,
        });
      }
      if (e.bannerImageUrl) {
        hasMedia = true;
        addRef(e.bannerImageUrl, {
          type: "event",
          id: String(e._id),
          title: e.title,
          usage: "Event Banner Image",
          dashboardUrl: `/dashboard/manage-events/event-detail/${e._id}`,
          publicUrl: `/events/${e.slug || e._id}`,
        });
      }
      if (Array.isArray(e.contributors)) {
        e.contributors.forEach((c: any) => {
          if (c.avatarUrl) {
            hasMedia = true;
            addRef(c.avatarUrl, {
              type: "event",
              id: String(e._id),
              title: `${e.title} (${c.name || "Contributor"})`,
              usage: "Event Contributor Avatar",
              dashboardUrl: `/dashboard/manage-events/event-detail/${e._id}`,
            });
          }
        });
      }
      if (hasMedia) eventCount++;
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning events:", err);
  }

  // 3. Blogs
  try {
    const blogs = await Blog.find({}, "title slug coverImageUrl content").lean().exec();

    blogs.forEach((b: any) => {
      let hasMedia = false;
      if (b.coverImageUrl) {
        hasMedia = true;
        addRef(b.coverImageUrl, {
          type: "blog",
          id: String(b._id),
          title: b.title,
          usage: "Blog Cover Image",
          dashboardUrl: `/dashboard/blogs`,
          publicUrl: `/blog/${b.slug}`,
        });
      }
      // Scan markdown/HTML content for image URLs
      if (b.content && typeof b.content === "string") {
        const imgMatches = b.content.match(/https:\/\/res\.cloudinary\.com\/[^\s"')]+/g);
        if (imgMatches) {
          hasMedia = true;
          imgMatches.forEach((url: string) => {
            addRef(url, {
              type: "blog",
              id: String(b._id),
              title: b.title,
              usage: "Article Embedded Image",
              dashboardUrl: `/dashboard/blogs`,
              publicUrl: `/blog/${b.slug}`,
            });
          });
        }
      }
      if (hasMedia) blogCount++;
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning blogs:", err);
  }

  // 4. Forms
  try {
    const forms = await Form.find({}, "title code coverImageUrl").lean().exec();

    forms.forEach((f: any) => {
      if (f.coverImageUrl) {
        formCount++;
        addRef(f.coverImageUrl, {
          type: "form",
          id: String(f._id),
          title: f.title || f.code || "Registration Form",
          usage: "Form Banner Image",
          dashboardUrl: `/dashboard/manage-events/forms/${f._id}`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning forms:", err);
  }

  // 5. Projects
  try {
    const projects = await Project.find({}, "title slug imageUrl imagePublicId").lean().exec();

    projects.forEach((p: any) => {
      if (p.imageUrl || p.imagePublicId) {
        projectCount++;
        addRef(p.imagePublicId || p.imageUrl, {
          type: "project",
          id: String(p._id),
          title: p.title,
          usage: "Project Showcase Image",
          dashboardUrl: `/dashboard/projects`,
          publicUrl: `/projects/${p.slug || p._id}`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning projects:", err);
  }

  // 6. Sponsors
  try {
    const sponsors = await Sponsor.find({}, "name logoUrl").lean().exec();

    sponsors.forEach((s: any) => {
      if (s.logoUrl) {
        sponsorCount++;
        addRef(s.logoUrl, {
          type: "sponsor",
          id: String(s._id),
          title: s.name,
          usage: "Sponsor Brand Logo",
          dashboardUrl: `/dashboard/sponsors`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning sponsors:", err);
  }

  // 7. Cover Presets
  try {
    const presets = await CoverPresetModel.find({}, "name category url publicId").lean().exec();

    presets.forEach((cp: any) => {
      if (cp.url || cp.publicId) {
        presetCount++;
        addRef(cp.publicId || cp.url, {
          type: "cover_preset",
          id: String(cp._id),
          title: `${cp.name} (${cp.category || "Preset"})`,
          usage: "Cover Preset Library",
          dashboardUrl: `/dashboard/media`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning cover presets:", err);
  }

  // 8. Media Gallery
  try {
    const mediaGallery = await Media.find({}, "title url imagePublicId").lean().exec();

    mediaGallery.forEach((m: any) => {
      if (m.url || m.imagePublicId) {
        galleryCount++;
        addRef(m.imagePublicId || m.url, {
          type: "media_gallery",
          id: String(m._id),
          title: m.title || "Gallery Media",
          usage: "Club Media Gallery",
          dashboardUrl: `/dashboard/media`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning media gallery:", err);
  }

  // 9. Certificates & Certificate Templates
  try {
    const templates = await CertificateTemplate.find({}, "name backgroundUrl signatories").lean().exec();
    templates.forEach((t: any) => {
      if (t.backgroundUrl) {
        certCount++;
        addRef(t.backgroundUrl, {
          type: "certificate",
          id: String(t._id),
          title: `${t.name} (Background)`,
          usage: "Certificate Background Template",
          dashboardUrl: `/dashboard/certificates`,
        });
      }
      if (Array.isArray(t.signatories)) {
        t.signatories.forEach((s: any) => {
          if (s.signatureImageUrl) {
            certCount++;
            addRef(s.signatureImageUrl, {
              type: "certificate",
              id: String(t._id),
              title: `${t.name} (Signatory: ${s.name || "Signature"})`,
              usage: "Certificate Signature Image",
              dashboardUrl: `/dashboard/certificates`,
            });
          }
        });
      }
    });

    const certs = await Certificate.find({ digitalUrl: { $ne: "" } }, "name certificateId digitalUrl").lean().exec();
    certs.forEach((c: any) => {
      if (c.digitalUrl) {
        certCount++;
        addRef(c.digitalUrl, {
          type: "certificate",
          id: String(c._id),
          title: `${c.name} (${c.certificateId})`,
          usage: "Issued Certificate Document",
          dashboardUrl: `/dashboard/certificates`,
        });
      }
    });
  } catch (err) {
    console.warn("[MediaReference] Error scanning certificates:", err);
  }

  const totalEntitiesWithMedia =
    userCount + eventCount + blogCount + formCount + projectCount + sponsorCount + presetCount + galleryCount + certCount;

  return {
    referenceMap,
    stats: {
      totalEntitiesWithMedia,
      breakdown: {
        users: userCount,
        events: eventCount,
        blogs: blogCount,
        forms: formCount,
        projects: projectCount,
        sponsors: sponsorCount,
        presets: presetCount,
        gallery: galleryCount,
        certificates: certCount,
      },
    },
  };
}

/**
 * Enhances a list of Cloudinary resources with their MongoDB references and link status.
 */
export function attachMediaReferences(
  resources: any[],
  referenceMap: Map<string, MediaEntityReference[]>
): any[] {
  return resources.map((r) => {
    const fullNormalized = normalizeMediaKey(r.publicId || r.public_id || r.secureUrl);
    const baseName = fullNormalized.split("/").pop() || fullNormalized;

    // Check direct normalized key first, then fallback to base filename
    let matched = referenceMap.get(fullNormalized) || referenceMap.get(baseName) || [];

    // If still unmatched and asset has timestamp appended (like in trash_to_delete)
    if (matched.length === 0 && (fullNormalized.includes("trash_to_delete") || baseName.includes("-"))) {
      const strippedBase = baseName.replace(/-\d{13}$/, "");
      if (strippedBase && strippedBase !== baseName) {
        matched = referenceMap.get(strippedBase) || [];
      }
    }

    return {
      ...r,
      linkedEntities: matched,
      isLinked: matched.length > 0,
      linkCount: matched.length,
    };
  });
}

function extractFolderFromUrl(url: string): string | null {
  try {
    let clean = url.replace(/.*\/(?:image|video|raw)\/upload\/(?:v\d+\/)?/, "");
    clean = clean.replace(/^\/+/, "");
    const parts = clean.split("/");
    if (parts.length > 1) {
      parts.pop(); // remove filename
      return parts.join("/");
    }
  } catch {}
  return null;
}

/**
 * Searches MongoDB models to find what folder an asset in trash originally belonged to.
 */
export async function findOriginalFolderFromDatabase(publicId: string): Promise<string | null> {
  const rawFilename = publicId.split("/").pop() || "";
  const cleanBaseName = rawFilename.replace(/-\d{13}$/, "");
  if (!cleanBaseName) return null;

  try {
    await connectDB();
    const regex = new RegExp(cleanBaseName.replace(/[-\\/\\^$*+?.()|[\\]{}]/g, "\\$&"), "i");

    // 1. Check User
    const user = await User.findOne({
      $or: [
        { imageUrl: regex },
        { coverUrl: regex },
        { imagePublicId: regex },
        { coverPublicId: regex },
      ],
    }).lean().exec();

    if (user) {
      if (user.imageUrl && regex.test(user.imageUrl)) {
        const folder = extractFolderFromUrl(user.imageUrl);
        if (folder) return folder;
      }
      if (user.coverUrl && regex.test(user.coverUrl)) {
        const folder = extractFolderFromUrl(user.coverUrl);
        if (folder) return folder;
      }
      return "uploads/users_pp";
    }

    // 2. Check Event
    const event = await Event.findOne({
      $or: [
        { coverImageUrl: regex },
        { "gallery.imageUrl": regex },
      ],
    }).lean().exec();

    if (event) {
      if (event.coverImageUrl && regex.test(event.coverImageUrl)) {
        const folder = extractFolderFromUrl(event.coverImageUrl);
        if (folder) return folder;
      }
      return "uploads/events";
    }

    // 3. Check Blog
    const blog = await Blog.findOne({ coverImageUrl: regex }).lean().exec();
    if (blog && blog.coverImageUrl) {
      const folder = extractFolderFromUrl(blog.coverImageUrl);
      if (folder) return folder;
      return "uploads/blogs";
    }

    // 4. Check Project
    const project = await Project.findOne({
      $or: [
        { imageUrl: regex },
        { imagePublicId: regex },
      ],
    }).lean().exec();
    if (project) {
      if (project.imageUrl && regex.test(project.imageUrl)) {
        const folder = extractFolderFromUrl(project.imageUrl);
        if (folder) return folder;
      }
      return "uploads/projects";
    }

    // 5. Check Sponsor
    const sponsor = await Sponsor.findOne({ logoUrl: regex }).lean().exec();
    if (sponsor && sponsor.logoUrl) {
      const folder = extractFolderFromUrl(sponsor.logoUrl);
      if (folder) return folder;
      return "uploads/sponsors";
    }

    // 6. Check CertificateTemplate
    const cert = await CertificateTemplate.findOne({
      $or: [{ bgImageUrl: regex }, { previewUrl: regex }],
    }).lean().exec();
    if (cert) {
      return "uploads/certificates";
    }
  } catch (err) {
    console.warn("[MediaReference] Error finding original folder:", err);
  }

  return null;
}

