import { Request, Response, NextFunction } from "express";
import Asset, { IAsset } from "../models/Asset.model";
import AuditLog from "../models/AuditLog.model";

/**
 * Get all assets (optionally filtered by ?type=borrowed|club)
 */
export const getAssets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, status, category, search } = req.query;
    const filter: any = {};

    if (type && (type === "borrowed" || type === "club")) {
      filter.assetType = type;
    }
    if (status && status !== "all") {
      filter.status = status;
    }
    if (category && category !== "all") {
      filter.category = category;
    }
    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
        { borrowedFrom: { $regex: q, $options: "i" } },
        { borrowedBy: { $regex: q, $options: "i" } },
        { custodian: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
      ];
    }

    const assets = await Asset.find(filter).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: assets.map((a: any) => ({
        ...a,
        id: a._id.toString(),
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new asset or borrowed equipment
 */
export const createAsset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const {
      assetType,
      name,
      category,
      quantity,
      location,
      condition,
      status,
      notes,
      borrowedFrom,
      borrowedBy,
      borrowDate,
      dueDate,
      returnDate,
      acquisitionDate,
      custodian,
      estimatedValue,
    } = req.body;

    if (!name || !category || !location) {
      return res.status(400).json({
        success: false,
        message: "Asset name, category, and location are required.",
      });
    }

    const newAsset = await Asset.create({
      assetType: assetType === "borrowed" ? "borrowed" : "club",
      name: name.trim(),
      category: category.trim(),
      quantity: Math.max(1, Number(quantity) || 1),
      location: location.trim(),
      condition: condition || "Good",
      status: status || (assetType === "borrowed" ? "In Use" : "Available"),
      notes: notes?.trim() || undefined,
      borrowedFrom: borrowedFrom?.trim() || undefined,
      borrowedBy: borrowedBy?.trim() || undefined,
      borrowDate: borrowDate?.trim() || undefined,
      dueDate: dueDate?.trim() || undefined,
      returnDate: returnDate?.trim() || undefined,
      acquisitionDate: acquisitionDate?.trim() || undefined,
      custodian: custodian?.trim() || undefined,
      estimatedValue: estimatedValue?.trim() || undefined,
      createdBy: user?._id || user?.id,
    });

    // Create Audit Log
    try {
      await AuditLog.create({
        timestamp: new Date(),
        actor: user?._id || user?.id,
        actorName: user?.fullName || "Admin",
        actorEmail: user?.email,
        actorRole: user?.role || "admin",
        action: "CREATE",
        targetType: "ASSET",
        targetId: newAsset._id.toString(),
        targetTitle: newAsset.name,
        description: `${user?.fullName || "Admin"} logged ${newAsset.assetType === "borrowed" ? "borrowed equipment" : "club asset"}: "${newAsset.name}".`,
        diff: [
          { field: "Quantity", newValue: newAsset.quantity },
          { field: "Location", newValue: newAsset.location },
          { field: "Condition", newValue: newAsset.condition },
          { field: "Status", newValue: newAsset.status },
        ],
      });
    } catch (e) {
      console.warn("Could not write asset audit log:", e);
    }

    res.status(201).json({
      success: true,
      data: {
        ...newAsset.toJSON(),
        id: newAsset._id.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing asset
 */
export const updateAsset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const existing = await Asset.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    const prevStatus = existing.status;
    const prevLocation = existing.location;
    const prevCondition = existing.condition;

    const updateFields = { ...req.body };
    delete updateFields._id;
    delete updateFields.id;
    delete updateFields.createdAt;
    delete updateFields.updatedAt;

    const updated = await Asset.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Asset not found after update.",
      });
    }

    // Build diff for audit log
    const diff: { field: string; previousValue: any; newValue: any }[] = [];
    if (prevStatus !== updated.status) {
      diff.push({ field: "Status", previousValue: prevStatus, newValue: updated.status });
    }
    if (prevLocation !== updated.location) {
      diff.push({ field: "Location", previousValue: prevLocation, newValue: updated.location });
    }
    if (prevCondition !== updated.condition) {
      diff.push({ field: "Condition", previousValue: prevCondition, newValue: updated.condition });
    }

    try {
      await AuditLog.create({
        timestamp: new Date(),
        actor: user?._id || user?.id,
        actorName: user?.fullName || "Admin",
        actorEmail: user?.email,
        actorRole: user?.role || "admin",
        action: prevStatus !== updated.status ? "STATUS_CHANGE" : "UPDATE",
        targetType: "ASSET",
        targetId: updated._id.toString(),
        targetTitle: updated.name,
        description: `${user?.fullName || "Admin"} updated asset: "${updated.name}"${prevStatus !== updated.status ? ` status changed from ${prevStatus} to ${updated.status}` : ""}.`,
        diff,
      });
    } catch (e) {
      console.warn("Could not write asset audit log:", e);
    }

    res.status(200).json({
      success: true,
      data: {
        ...updated.toJSON(),
        id: updated._id.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an asset
 */
export const deleteAsset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const existing = await Asset.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Asset not found.",
      });
    }

    await Asset.findByIdAndDelete(id);

    try {
      await AuditLog.create({
        timestamp: new Date(),
        actor: user?._id || user?.id,
        actorName: user?.fullName || "Admin",
        actorEmail: user?.email,
        actorRole: user?.role || "admin",
        action: "DELETE",
        targetType: "ASSET",
        targetId: id,
        targetTitle: existing.name,
        description: `${user?.fullName || "Admin"} removed asset: "${existing.name}".`,
      });
    } catch (e) {
      console.warn("Could not write asset audit log:", e);
    }

    res.status(200).json({
      success: true,
      message: "Asset deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
