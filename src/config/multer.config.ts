import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import path from "path";
import fs from "fs";

export const isCloudinaryConfigured = (): boolean => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(
    name &&
      key &&
      secret &&
      name !== "your_cloudinary_cloud_name" &&
      name.trim().length > 0 &&
      key.trim().length > 0 &&
      secret.trim().length > 0
  );
};

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const sanitizeName = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-");
};

/**
 * Determine the local organized directory under public/uploads based on upload source and request context
 */
const getOrganizedUploadDir = (req: any, file: Express.Multer.File, defaultFolder: string) => {
  const isPdf =
    file.mimetype === "application/pdf" ||
    path.extname(file.originalname).toLowerCase() === ".pdf";

  let subfolder = defaultFolder;

  if (defaultFolder === "questions" || defaultFolder.startsWith("questions")) {
    const dept = (req.body?.department || req.query?.department || "general")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const sem = (req.body?.semester || req.query?.semester || "").toString().trim().replace(/[^0-9]/g, "");
    const year = (req.body?.year || req.query?.year || "").toString().trim().replace(/[^0-9]/g, "");

    if (dept && sem) {
      subfolder = path.join("questions", dept, `semester-${sem}`);
    } else if (dept) {
      subfolder = path.join("questions", dept);
    } else {
      subfolder = "questions";
    }
  } else if (defaultFolder === "forms" || defaultFolder === "form_attachments") {
    const formId = (req.body?.formId || req.query?.formId || req.params?.id || "general")
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "");
    subfolder = path.join(defaultFolder, formId);
  } else if (defaultFolder.startsWith("users")) {
    subfolder = defaultFolder.replace(/[^a-zA-Z0-9_-]/g, "");
  } else if (defaultFolder === "events" || defaultFolder === "event_media") {
    subfolder = "events";
  } else {
    const custom = (req.query?.folder || req.body?.folder || defaultFolder).toString().trim();
    subfolder = custom.replace(/[^a-zA-Z0-9_/-]/g, "");
  }

  const fullDir = path.join(process.cwd(), "public", "uploads", subfolder);
  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }

  return { fullDir, subfolder };
};

/**
 * Custom Hybrid Multer Storage Engine:
 * - Always saves PDF documents to hosting filesystem (public/uploads/<source>)
 * - Saves images to Cloudinary if configured; otherwise gracefully falls back to local hosting filesystem
 */
class HybridStorageEngine implements multer.StorageEngine {
  private defaultFolder: string;
  private isRawAllowed: boolean;

  constructor(defaultFolder: string, isRawAllowed = false) {
    this.defaultFolder = defaultFolder;
    this.isRawAllowed = isRawAllowed;
  }

  _handleFile(req: any, file: Express.Multer.File, cb: (error?: any, info?: Partial<Express.Multer.File>) => void) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || ext === ".pdf";
    const useCloudinary = !isPdf && isCloudinaryConfigured();

    if (useCloudinary) {
      // Use CloudinaryStorage
      let desiredName = path.parse(file.originalname).name;
      if (req.body?.data) {
        try {
          const data = JSON.parse(req.body.data);
          desiredName = data.fullName || desiredName;
        } catch {}
      }
      const folder = req.query?.folder || req.body?.folder || this.defaultFolder;

      const cldStorage = new CloudinaryStorage({
        cloudinary,
        params: async () => ({
          folder: `uploads/${folder}`,
          resource_type: this.isRawAllowed ? "auto" : "image",
          public_id: `${sanitizeName(desiredName)}-${Date.now()}`,
          ...(this.isRawAllowed ? {} : { allowed_formats: ["jpg", "png", "jpeg", "webp", "gif", "svg"] }),
        }),
      });

      return cldStorage._handleFile(req, file, cb);
    }

    // Disk storage on local hosting filesystem
    try {
      const { fullDir, subfolder } = getOrganizedUploadDir(req, file, this.defaultFolder);
      let desiredName = path.parse(file.originalname).name;
      if (req.body?.data) {
        try {
          const data = JSON.parse(req.body.data);
          desiredName = data.fullName || desiredName;
        } catch {}
      }

      const safeExt = ext || (isPdf ? ".pdf" : ".jpg");
      const filename = `${sanitizeName(desiredName)}-${Date.now()}${safeExt}`;
      const filePath = path.join(fullDir, filename);

      const outStream = fs.createWriteStream(filePath);
      file.stream.pipe(outStream);

      outStream.on("error", (err) => cb(err));
      outStream.on("finish", () => {
        // Construct web-accessible public URL
        const normalizedSubfolder = subfolder.replace(/\\/g, "/");
        const publicUrl = `/public/uploads/${normalizedSubfolder}/${filename}`;

        cb(null, {
          destination: fullDir,
          filename,
          path: filePath,
          size: outStream.bytesWritten,
          // Attach friendly fields for controllers
          ...({
            url: publicUrl,
            secure_url: publicUrl,
            public_id: filename,
          } as any),
        });
      });
    } catch (err) {
      cb(err);
    }
  }

  _removeFile(req: any, file: Express.Multer.File, cb: (error: Error | null) => void) {
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
        cb(null);
      } catch (err: any) {
        cb(err);
      }
    } else {
      cb(null);
    }
  }
}

export const createUploader = (defaultFolder: string) => {
  return multer({
    storage: new HybridStorageEngine(defaultFolder, false),
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB limit
    },
  });
};

export const createFileUploader = (defaultFolder: string) => {
  return multer({
    storage: new HybridStorageEngine(defaultFolder, true),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });
};

export const createQuestionFileUploader = (defaultFolder: string = "questions") => {
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
    storage: new HybridStorageEngine(defaultFolder, true),
    fileFilter,
    limits: {
      fileSize: 35 * 1024 * 1024, // 35MB limit
    },
  });
};

export const createQuestionPdfUploader = createQuestionFileUploader;
