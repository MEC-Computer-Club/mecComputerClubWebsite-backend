import { Request, Response } from "express";
import { uploadToCloudinary, deleteFromCloudinary } from "../services/upload.service";

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file" });

    const result = await uploadToCloudinary(req.file);

    res.json({
      url: result.secure_url || result.url,
      public_id: result.public_id,
      folder: req.query.folder || req.body?.folder || "misc",
    });
  } catch (err: any) {
    console.error("Cloudinary Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

import { v2 as cloudinary } from "cloudinary";
import https from "https";
import http from "http";

export const deleteImage = async (req: Request, res: Response) => {
  try {
    let { public_id, url } = req.body;
    if (!public_id && url && typeof url === "string") {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
      if (match && match[1]) {
        public_id = match[1];
      }
    }
    if (!public_id) {
      return res.status(400).json({ message: "public_id or url is required" });
    }
    await deleteFromCloudinary(public_id);
    res.json({ success: true, message: "Image deleted from Cloudinary." });
  } catch (err: any) {
    console.error("Cloudinary Delete error:", err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

/**
 * @desc Stream/Proxy PDF documents bypassing Cloudinary delivery restrictions
 * @route GET /api/upload/pdf-view
 */
export const viewPdf = async (req: Request, res: Response) => {
  try {
    const rawUrl = (req.query.url as string) || "";
    let publicId = (req.query.public_id as string) || "";
    const isDownload = req.query.download === "true";
    const filename = (req.query.filename as string) || "document.pdf";

    if (!publicId && rawUrl) {
      const match = rawUrl.match(/\/v\d+\/(.+?)(\.pdf)?$/);
      if (match) {
        publicId = match[1];
      }
    }

    if (publicId) {
      // Generate private signed URL that bypasses Cloudinary PDF restriction
      const downloadUrl = cloudinary.utils.private_download_url(publicId, "pdf", {
        resource_type: "image",
        type: "upload",
      });

      const client = downloadUrl.startsWith("https") ? https : http;
      return client.get(downloadUrl, (cloudRes) => {
        if (cloudRes.statusCode !== 200) {
          // Fallback to raw resource_type if image failed
          const rawDownloadUrl = cloudinary.utils.private_download_url(publicId, "pdf", {
            resource_type: "raw",
            type: "upload",
          });
          return client.get(rawDownloadUrl, (rawRes) => {
            if (rawRes.statusCode !== 200) {
              return res.status(404).json({ message: "PDF document not found in storage" });
            }
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
              "Content-Disposition",
              `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`
            );
            res.setHeader("Cache-Control", "public, max-age=86400");
            rawRes.pipe(res);
          });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`
        );
        res.setHeader("Cache-Control", "public, max-age=86400");
        cloudRes.pipe(res);
      });
    }

    if (rawUrl) {
      const client = rawUrl.startsWith("https") ? https : http;
      return client.get(rawUrl, (externalRes) => {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`
        );
        externalRes.pipe(res);
      });
    }

    return res.status(400).json({ message: "Missing url or public_id parameter" });
  } catch (err: any) {
    console.error("PDF View error:", err);
    res.status(500).json({ message: "Failed to load PDF", error: err.message });
  }
};

/**
 * @desc Fetch/Proxy a remote image (e.g. from Facebook, Google, CDN) to bypass CORS
 * @route GET /api/upload/proxy-image
 */
export const proxyImage = async (req: Request, res: Response) => {
  try {
    const rawUrl = (req.query.url as string) || "";
    if (!rawUrl || (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://"))) {
      return res.status(400).json({ message: "Valid image URL is required" });
    }

    const fetchWithRedirects = (urlStr: string, redirectsRemaining: number) => {
      if (redirectsRemaining <= 0) {
        return res.status(400).json({ message: "Too many redirects" });
      }

      const reqClient = urlStr.startsWith("https") ? https : http;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch {
        return res.status(400).json({ message: "Invalid URL provided" });
      }

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (urlStr.startsWith("https") ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": parsedUrl.origin,
        },
      };

      const request = reqClient.get(requestOptions, (remoteRes) => {
        if (
          remoteRes.statusCode &&
          [301, 302, 303, 307, 308].includes(remoteRes.statusCode) &&
          remoteRes.headers.location
        ) {
          const redirectUrl = new URL(remoteRes.headers.location, urlStr).toString();
          return fetchWithRedirects(redirectUrl, redirectsRemaining - 1);
        }

        if (remoteRes.statusCode && (remoteRes.statusCode < 200 || remoteRes.statusCode >= 300)) {
          return res.status(remoteRes.statusCode || 500).json({ message: "Failed to fetch remote image" });
        }

        const contentType = remoteRes.headers["content-type"] || "image/jpeg";

        // If the URL is an HTML webpage (e.g. Facebook photo page link), extract og:image
        if (contentType.includes("text/html")) {
          let htmlData = "";
          remoteRes.setEncoding("utf8");
          remoteRes.on("data", (chunk) => {
            if (htmlData.length < 131072) htmlData += chunk;
          });
          remoteRes.on("end", () => {
            const ogMatch =
              htmlData.match(
                /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
              ) ||
              htmlData.match(
                /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
              ) ||
              htmlData.match(
                /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
              ) ||
              htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);

            if (ogMatch && ogMatch[1]) {
              let extractedUrl = ogMatch[1].replace(/&amp;/g, "&");
              if (extractedUrl.startsWith("/")) {
                extractedUrl = new URL(extractedUrl, urlStr).toString();
              }
              return fetchWithRedirects(extractedUrl, redirectsRemaining - 1);
            }

            return res.status(400).json({
              message: "Provided URL returned HTML without a detectable image",
            });
          });
          return;
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        remoteRes.pipe(res);
      });

      request.on("error", (err) => {
        console.error("Proxy image request error:", err);
        res.status(500).json({ message: "Network error fetching remote image", error: err.message });
      });
    };

    fetchWithRedirects(rawUrl, 4);
  } catch (err: any) {
    console.error("proxyImage error:", err);
    res.status(500).json({ message: "Failed to load image", error: err.message });
  }
};

