import mongoose, { Schema, Document } from "mongoose";

export interface IBlog extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string; // HTML or markdown
  coverImageUrl?: string;
  coverImagePosition?: string;
  author: mongoose.Types.ObjectId;
  category: string;
  tags: string[];
  isPublished: boolean;
  publishedAt?: Date;
  views: number;
  likes: mongoose.Types.ObjectId[];
  likesCount: number;
  featured?: boolean;
  readTime?: number;
}

const BlogSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    coverImageUrl: { type: String },
    coverImagePosition: { type: String, default: "50% 50%" },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, default: "General", trim: true },
    tags: { type: [String], default: [] },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    views: { type: Number, default: 0 },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    likesCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false, index: true },
    readTime: { type: Number, default: 1 },
  },
  { timestamps: true }
);

BlogSchema.index({ isPublished: 1, featured: -1, publishedAt: -1, createdAt: -1 });
BlogSchema.index({ author: 1, createdAt: -1 });

// Auto-generate unique slug and compute readTime
BlogSchema.pre("validate", async function (next) {
  if (this.content) {
    const text = (this.content as string).replace(/<[^>]*>/g, " ");
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    this.readTime = Math.max(1, Math.ceil(words / 200));
  }
  if (!this.slug && this.title) {
    let baseSlug = (this.title as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!baseSlug) {
      baseSlug = "blog-" + Date.now().toString(36);
    }
    const BlogModel = mongoose.models.Blog || mongoose.model("Blog", BlogSchema);
    const existing = await BlogModel.findOne({ slug: baseSlug, _id: { $ne: this._id } });
    if (existing) {
      this.slug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
    } else {
      this.slug = baseSlug;
    }
  }
  next();
});

export const Blog = mongoose.model<IBlog>("Blog", BlogSchema);
