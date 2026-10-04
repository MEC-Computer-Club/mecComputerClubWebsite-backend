import { Request, Response, NextFunction } from "express";
import { v2 as cloudinary } from "cloudinary";
import { moveToTrashInCloudinary, deleteFromCloudinary, restoreFromTrashInCloudinary } from "../services/upload.service";
import { getDatabaseMediaReferences, attachMediaReferences, findOriginalFolderFromDatabase } from "../services/mediaReference.service";
import "../config/env";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * @desc Get Cloudinary storage and usage statistics
 * @route GET /api/media-manager/stats
 * @access Admin, Moderator, Advisor
 */
export const getMediaStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usage = await cloudinary.api.usage();

    const rawStorageBytes = usage.storage?.usage || 0;
    const bandwidthBytes = usage.bandwidth?.usage || 0;

    // Calculate size and count of samples: total media = all - size(/sample)
    let sampleBytes = 144415876;
    let sampleCount = 40;
    try {
      const sampleRes = await cloudinary.search
        .expression("folder:samples*")
        .max_results(100)
        .execute();
      if (sampleRes && sampleRes.resources) {
        sampleCount = sampleRes.total_count || sampleRes.resources.length;
        sampleBytes = sampleRes.resources.reduce((acc: number, r: any) => acc + (r.bytes || 0), 0);
      }
    } catch (e) {
      console.warn("Could not query samples stats:", e);
    }

    // Storage excluding /sample size: all - size(/sample)
    const storageBytes = Math.max(0, rawStorageBytes - sampleBytes);

    // Total media count: all assets minus samples count
    let totalAssets = Math.max(0, (usage.objects?.usage || 0) - sampleCount);
    try {
      const nonSampleSearch = await cloudinary.search
        .expression("-folder:samples* -public_id:cld-sample* -public_id:sample")
        .max_results(1)
        .execute();
      if (typeof nonSampleSearch.total_count === "number") {
        totalAssets = nonSampleSearch.total_count;
      }
    } catch (e) {
      console.warn("Could not query non-sample asset count:", e);
    }

    // Cloudinary Free tier defaults: 25 credits = 25 GB storage or bandwidth
    const creditsUsed = usage.credits?.usage || 0;
    const creditsLimit = usage.credits?.limit || 25;
    const percentUsed = usage.credits?.used_percent || ((creditsUsed / creditsLimit) * 100);

    const { stats: dbStats } = await getDatabaseMediaReferences();

    const stats = {
      plan: usage.plan || "Free",
      lastUpdated: usage.last_updated || new Date().toISOString(),
      storage: {
        bytes: storageBytes,
        formatted: formatBytes(storageBytes),
        credits: usage.storage?.credits_usage || 0,
      },
      bandwidth: {
        bytes: bandwidthBytes,
        formatted: formatBytes(bandwidthBytes),
        credits: usage.bandwidth?.credits_usage || 0,
      },
      objects: {
        totalAssets,
      },
      transformations: {
        usage: usage.transformations?.usage || 0,
        credits: usage.transformations?.credits_usage || 0,
      },
      credits: {
        usage: creditsUsed,
        limit: creditsLimit,
        percentUsed: Math.min(100, Math.round(percentUsed * 100) / 100),
        remaining: Math.max(0, Math.round((creditsLimit - creditsUsed) * 100) / 100),
      },
      databaseReferences: dbStats,
      rateLimit: {
        remaining: usage.rate_limit_remaining,
        allowed: usage.rate_limit_allowed,
        resetAt: usage.rate_limit_reset_at,
      },
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc List all available Cloudinary folders
 * @route GET /api/media-manager/folders
 * @access Admin, Moderator, Advisor
 */
export const getMediaFolders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rootRes, uploadsRes, mecWebRes] = await Promise.allSettled([
      cloudinary.api.root_folders(),
      cloudinary.api.sub_folders("uploads"),
      cloudinary.api.sub_folders("mec-cc-web"),
    ]);

    const rootFolders = rootRes.status === "fulfilled" ? rootRes.value.folders : [];
    const uploadSub = uploadsRes.status === "fulfilled" ? uploadsRes.value.folders : [];
    const mecWebSub = mecWebRes.status === "fulfilled" ? mecWebRes.value.folders : [];

    const folderMap = new Map<string, { name: string; path: string; parent?: string }>();

    // Add root folders (strictly exclude samples)
    rootFolders
      .filter((f: any) => f.name !== "samples" && f.path !== "samples" && !f.path.startsWith("samples/"))
      .forEach((f: any) => {
        folderMap.set(f.path, { name: f.name, path: f.path });
      });

    // Add uploads subfolders
    uploadSub.forEach((f: any) => {
      folderMap.set(f.path, { name: f.name, path: f.path, parent: "uploads" });
    });

    // Add mec-cc-web subfolders
    mecWebSub.forEach((f: any) => {
      folderMap.set(f.path, { name: f.name, path: f.path, parent: "mec-cc-web" });
    });

    // Ensure standard club folders are registered (exclude trash_to_delete)
    const standardCategories = [
      "events",
      "event_media",
      "blog-covers",
      "blog-content",
      "club_logo",
      "club_docs",
      "forms",
      "form_attachments",
      "users_pp",
      "users_cover",
      "cover_presets",
    ];

    standardCategories.forEach((cat) => {
      const p = `uploads/${cat}`;
      if (!folderMap.has(p)) {
        folderMap.set(p, { name: cat, path: p, parent: "uploads" });
      }
    });

    return res.status(200).json({
      success: true,
      data: Array.from(folderMap.values()),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get resources / media files with search & pagination & DB linkage detection
 * @route GET /api/media-manager/resources
 * @access Admin, Moderator, Advisor
 */
export const getMediaResources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      folder,
      search,
      resourceType = "all", // "all", "image", "video", "raw"
      linkStatus = "unlinked", // default to "unlinked"
      nextCursor,
      maxResults = 40,
      sortBy = "created_at",
      sortDir = "desc",
    } = req.query;

    let expressions: string[] = [];

    // Filter by folder if specified
    if (folder && folder !== "all") {
      const cleanFolder = String(folder).replace(/\/$/, "");
      expressions.push(`folder:${cleanFolder}*`);
    } else {
      // Strictly exclude /samples and demo assets from search expressions
      expressions.push("-folder:samples* -public_id:cld-sample* -public_id:sample");
    }

    // Filter by resource type
    if (resourceType && resourceType !== "all") {
      expressions.push(`resource_type:${resourceType}`);
    }

    // Keyword search
    if (search && String(search).trim()) {
      const term = String(search).trim();
      expressions.push(`(filename:*${term}* OR public_id:*${term}*)`);
    }

    const expressionStr = expressions.length > 0 ? expressions.join(" AND ") : "";
    const sortField = sortBy === "bytes" ? "bytes" : "created_at";
    const sortDirection = sortDir === "asc" ? "asc" : "desc";
    const limit = Math.min(100, Math.max(1, parseInt(String(maxResults)) || 24));

    const { referenceMap } = await getDatabaseMediaReferences();

    let accumulatedUnlinked: any[] = [];
    let currentCursor: string | null = nextCursor ? String(nextCursor) : null;
    let nextCloudinaryCursor: string | null = null;
    let totalCatalogCount = 0;

    // Loop through Cloudinary pages until we either collect `limit` items or run out of results
    do {
      let searchBuilder: any = cloudinary.search;
      if (expressionStr) {
        searchBuilder = searchBuilder.expression(expressionStr);
      }
      searchBuilder = searchBuilder.sort_by(sortField, sortDirection);
      searchBuilder = searchBuilder.max_results(limit);

      if (currentCursor) {
        searchBuilder = searchBuilder.next_cursor(currentCursor);
      }

      const result = await searchBuilder.execute();
      totalCatalogCount = result.total_count || totalCatalogCount;
      nextCloudinaryCursor = result.next_cursor || null;

      const mappedResources = (result.resources || [])
        .filter((r: any) => {
          if (!r.public_id) return false;
          const pid = r.public_id.toLowerCase();
          if (pid.startsWith("samples/") || pid === "samples" || pid.startsWith("cld-sample") || pid === "sample") return false;
          if (r.folder && (r.folder === "samples" || r.folder.startsWith("samples/"))) return false;
          return true;
        })
        .map((r: any) => ({
          assetId: r.asset_id,
          publicId: r.public_id,
          folder: r.folder,
          filename: r.filename,
          format: r.format,
          resourceType: r.resource_type,
          width: r.width,
          height: r.height,
          aspectRatio: r.aspect_ratio,
          bytes: r.bytes,
          formattedSize: formatBytes(r.bytes),
          url: r.url,
          secureUrl: r.secure_url,
          createdAt: r.created_at,
          uploadedAt: r.uploaded_at,
        }));

      const enrichedResources = attachMediaReferences(mappedResources, referenceMap);

      let batchFiltered = enrichedResources;
      if (linkStatus === "unlinked") {
        batchFiltered = enrichedResources.filter((r) => !r.isLinked);
      } else if (linkStatus === "linked") {
        batchFiltered = enrichedResources.filter((r) => r.isLinked);
      }

      accumulatedUnlinked.push(...batchFiltered);
      currentCursor = nextCloudinaryCursor;

      // Stop if we have accumulated enough unlinked items, or if Cloudinary has no more pages
      if (accumulatedUnlinked.length >= limit || !currentCursor) {
        break;
      }
    } while (currentCursor);

    // If accumulated items exceeded limit, slice to limit and keep cursor
    const finalResources = accumulatedUnlinked.slice(0, limit);
    const hasMore = Boolean(currentCursor) || accumulatedUnlinked.length > limit;

    return res.status(200).json({
      success: true,
      data: {
        resources: finalResources,
        totalCount: linkStatus === "all" ? totalCatalogCount : finalResources.length,
        nextCursor: hasMore ? currentCursor : null,
        totalResolvedLinked: finalResources.filter((r: any) => r.isLinked).length,
        totalResolvedUnlinked: finalResources.filter((r: any) => !r.isLinked).length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Direct upload media file to Cloudinary into a specified folder
 * @route POST /api/media-manager/upload
 * @access Admin, Moderator
 */
export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided for upload" });
    }

    const file = req.file as any;
    const targetFolder = (req.body.folder || "uploads/misc").replace(/^\/+|\/+$/g, "");

    return res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      data: {
        assetId: file.asset_id || "",
        publicId: file.filename || file.public_id,
        url: file.path || file.secure_url,
        secureUrl: file.secure_url || file.path,
        folder: targetFolder,
        bytes: file.size,
        format: file.format || "",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Permanently delete asset from Cloudinary
 * @route DELETE /api/media-manager/resource
 * @access Admin, Moderator
 */
export const deleteMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publicIds = req.body?.publicIds;
    if (Array.isArray(publicIds) && publicIds.length > 0) {
      const result = await cloudinary.api.delete_resources(publicIds, {
        invalidate: true,
      });
      return res.status(200).json({
        success: true,
        message: `${publicIds.length} media assets permanently removed from Cloudinary.`,
        result,
      });
    }

    const publicId = req.body?.publicId || req.query?.publicId;
    const resourceType = req.body?.resourceType || req.query?.resourceType || "image";

    if (!publicId) {
      return res.status(400).json({ success: false, message: "publicId is required" });
    }

    // Permanently remove the image from Cloudinary directly
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType as any,
      invalidate: true,
    });

    return res.status(200).json({
      success: true,
      message: "Media asset permanently removed from Cloudinary.",
      result,
    });
  } catch (error: any) {
    console.error("Delete media error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to permanently delete media asset from Cloudinary",
    });
  }
};

/**
 * @desc Create a new folder in Cloudinary
 * @route POST /api/media-manager/folders
 * @access Admin, Moderator
 */
export const createFolder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || !folderPath.trim()) {
      return res.status(400).json({ success: false, message: "folderPath is required" });
    }

    const cleanPath = folderPath.trim().replace(/^\/+|\/+$/g, "");
    const result = await cloudinary.api.create_folder(cleanPath);

    return res.status(201).json({
      success: true,
      message: `Folder "${cleanPath}" created successfully.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Restore a media asset from trash_to_delete back to its original or designated folder
 * @route POST /api/media-manager/restore
 * @access Admin, Moderator, Advisor, Executive
 */
export const restoreMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publicId = req.body?.publicId;
    let targetFolder = req.body?.targetFolder;
    const resourceType = req.body?.resourceType || "image";

    if (!publicId) {
      return res.status(400).json({ success: false, message: "publicId is required" });
    }

    if (!publicId.includes("trash_to_delete")) {
      return res.status(400).json({
        success: false,
        message: "Only assets currently located in trash_to_delete can be restored.",
      });
    }

    // If targetFolder is not explicitly provided, try to discover original folder from DB
    if (!targetFolder || !targetFolder.trim()) {
      const discoveredFolder = await findOriginalFolderFromDatabase(publicId);
      if (discoveredFolder) {
        targetFolder = discoveredFolder;
      }
    }

    const restoreResult = await restoreFromTrashInCloudinary(publicId, targetFolder, resourceType);

    return res.status(200).json({
      success: true,
      message: `Asset successfully restored to "${restoreResult.targetFolder}".`,
      data: restoreResult,
    });
  } catch (error: any) {
    console.error("Restore media error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to restore media asset from Cloudinary trash",
    });
  }
};

