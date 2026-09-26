import { Request, Response, NextFunction } from "express";
import { Blog } from "../models/Blog.model";

export const createBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorId = (req as any).user?.id;
    const blog = await Blog.create({ ...req.body, author: authorId });
    res.status(201).json({ success: true, data: blog });
  } catch (error) { next(error); }
};

export const getAllBlogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.all !== "true") {
      filter.isPublished = true;
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.featured !== undefined) {
      filter.featured = String(req.query.featured) === "true";
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    let query = Blog.find(filter)
      .select("-content")
      .populate("author", "fullName imageUrl")
      .sort({ featured: -1, publishedAt: -1, createdAt: -1 });

    if (limit && !isNaN(limit)) {
      query = query.limit(limit);
    }

    const blogs = await query.lean();
    res.status(200).json({ success: true, data: blogs });
  } catch (error) { next(error); }
};

export const getMyBlogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorId = (req as any).user?.id;
    const blogs = await Blog.find({ author: authorId })
      .populate("author", "fullName imageUrl")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: blogs });
  } catch (error) { next(error); }
};

export const getBlogById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blog = await Blog.findById(req.params.id).populate("author", "fullName imageUrl").lean();
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
    res.status(200).json({ success: true, data: blog });
  } catch (error) { next(error); }
};

export const getBlogBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug }).populate("author", "fullName imageUrl").lean();
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
    res.status(200).json({ success: true, data: blog });
  } catch (error) { next(error); }
};

export const incrementBlogView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = req.params.id || req.params.slug;
    if (!identifier) {
      return res.status(400).json({ success: false, message: "Blog identifier is required" });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const filter = isObjectId ? { _id: identifier } : { slug: identifier };

    const blog = await Blog.findOneAndUpdate(
      filter,
      { $inc: { views: 1 } },
      { new: true, select: "views" }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    res.status(200).json({ success: true, views: blog.views });
  } catch (error) {
    next(error);
  }
};

export const toggleFeaturedBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });

    const newFeatured = req.body.featured !== undefined ? Boolean(req.body.featured) : !blog.featured;
    if (newFeatured && !blog.featured) {
      const featuredCount = await Blog.countDocuments({ featured: true });
      if (featuredCount >= 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 blogs can be featured on the Home page. Please unfeature an existing blog first.",
        });
      }
    }

    blog.featured = newFeatured;
    await blog.save();

    const populated = await Blog.findById(blog._id)
      .populate("author", "fullName imageUrl")
      .lean();

    res.status(200).json({
      success: true,
      data: populated || blog,
      message: newFeatured ? "Blog featured on Home page!" : "Blog removed from Home featured list",
    });
  } catch (error) {
    next(error);
  }
};

export const updateBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    const existing = await Blog.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Blog not found" });

    // Only the author or admin/moderator can update
    const isOwner = existing.author.toString() === userId;
    const isPrivileged = userRole === "admin" || userRole === "moderator";
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ success: false, message: "You can only edit your own blogs" });
    }

    const update = { ...req.body };
    if (!isPrivileged && update.featured !== undefined) {
      delete update.featured;
    } else if (isPrivileged && update.featured && !existing.featured) {
      const featuredCount = await Blog.countDocuments({ featured: true });
      if (featuredCount >= 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 blogs can be featured on the Home page. Please unfeature an existing blog first.",
        });
      }
    }
    if (update.isPublished && !update.publishedAt) update.publishedAt = new Date();
    const blog = await Blog.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: blog });
  } catch (error) { next(error); }
};

export const deleteBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;

    const existing = await Blog.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Blog not found" });

    // Only the author or admin/moderator can delete
    const isOwner = existing.author.toString() === userId;
    const isPrivileged = userRole === "admin" || userRole === "moderator";
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ success: false, message: "You can only delete your own blogs" });
    }

    await Blog.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Blog deleted" });
  } catch (error) { next(error); }
};

export const toggleBlogLike = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please login to react" });
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    const likesArray = blog.likes || [];
    const alreadyLiked = likesArray.some((id: any) => id.toString() === userId.toString());

    let updatedBlog;
    if (alreadyLiked) {
      updatedBlog = await Blog.findByIdAndUpdate(
        req.params.id,
        {
          $pull: { likes: userId },
          $inc: { likesCount: -1 },
        },
        { new: true }
      );
    } else {
      updatedBlog = await Blog.findByIdAndUpdate(
        req.params.id,
        {
          $addToSet: { likes: userId },
          $inc: { likesCount: 1 },
        },
        { new: true }
      );
    }

    const currentLikesCount = Math.max(
      0,
      updatedBlog?.likesCount ?? (alreadyLiked ? likesArray.length - 1 : likesArray.length + 1)
    );

    res.status(200).json({
      success: true,
      isLiked: !alreadyLiked,
      likesCount: currentLikesCount,
    });
  } catch (error) {
    next(error);
  }
};

