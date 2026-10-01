import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import path from "path";

// Configure Cloudinary with credentials from env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sanitizeName = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-");
};

export const createUploader = (defaultFolder: string) => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req: any, file: any) => {
      // Determine the filename (public_id)
      let desiredName = path.parse(file.originalname).name;

      if (req.body?.data) {
        try {
          const data = JSON.parse(req.body.data);
          desiredName = data.fullName || desiredName;
        } catch {
          // fallback to original name
        }
      }

      const folder = req.query?.folder || req.body?.folder || defaultFolder;

      return {
        folder: `uploads/${folder}`,
        public_id: `${sanitizeName(desiredName)}-${Date.now()}`,
        allowed_formats: ["jpg", "png", "jpeg", "webp", "gif", "svg"],
      };
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB limit
    },
  });
};

export const createFileUploader = (defaultFolder: string) => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req: any, file: any) => {
      let desiredName = path.parse(file.originalname).name;
      const folder = req.query?.folder || req.body?.folder || defaultFolder;

      return {
        folder: `uploads/${folder}`,
        resource_type: "auto",
        public_id: `${sanitizeName(desiredName)}-${Date.now()}`,
      };
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });
};

export const createQuestionFileUploader = (defaultFolder: string = "questions") => {
  const isCloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET &&
      process.env.CLOUDINARY_CLOUD_NAME !== "your_cloudinary_cloud_name"
  );

  let storage: multer.StorageEngine;

  if (isCloudinaryConfigured) {
    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: async (req: any, file: any) => {
        const desiredName = path.parse(file.originalname).name;
        const folder = req.query?.folder || req.body?.folder || defaultFolder;

        return {
          folder: `uploads/${folder}`,
          resource_type: "auto",
          public_id: `${sanitizeName(desiredName)}-${Date.now()}`,
        };
      },
    });
  } else {
    // Disk storage fallback for local development & testing
    const uploadDir = path.join(process.cwd(), "public", "uploads", defaultFolder);
    const fs = require("fs");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
        const desiredName = sanitizeName(path.parse(file.originalname).name);
        cb(null, `${desiredName}-${Date.now()}${ext}`);
      },
    });
  }

  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || ext === ".pdf";
    const isImage =
      file.mimetype.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"].includes(ext);

    if (isPdf || isImage) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF documents and image files (PNG, JPG, WEBP, GIF) are allowed for question papers"));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 35 * 1024 * 1024, // 35MB limit
    },
  });
};

export const createQuestionPdfUploader = createQuestionFileUploader;
