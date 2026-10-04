import mongoose, { Schema, Document } from "mongoose";

export type AssetType = "borrowed" | "club";
export type AssetCondition = "New" | "Excellent" | "Good" | "Fair" | "Damaged";

export interface IAsset extends Document {
  assetType: AssetType;
  name: string;
  category: string;
  quantity: number;
  location: string;
  condition: AssetCondition;
  status: string;
  notes?: string;

  // Specific to borrowed equipment
  borrowedFrom?: string;
  borrowedBy?: string;
  borrowDate?: string;
  dueDate?: string;
  returnDate?: string;

  // Specific to club assets
  acquisitionDate?: string;
  custodian?: string;
  estimatedValue?: string;

  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema: Schema = new Schema(
  {
    assetType: {
      type: String,
      enum: ["borrowed", "club"],
      default: "club",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Asset name is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Asset category is required"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    location: {
      type: String,
      required: [true, "Asset location is required"],
      trim: true,
    },
    condition: {
      type: String,
      enum: ["New", "Excellent", "Good", "Fair", "Damaged"],
      default: "Good",
    },
    status: {
      type: String,
      required: true,
      default: "Available",
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },

    // Borrowed equipment fields
    borrowedFrom: {
      type: String,
      trim: true,
    },
    borrowedBy: {
      type: String,
      trim: true,
    },
    borrowDate: {
      type: String,
      trim: true,
    },
    dueDate: {
      type: String,
      trim: true,
    },
    returnDate: {
      type: String,
      trim: true,
    },

    // Club asset fields
    acquisitionDate: {
      type: String,
      trim: true,
    },
    custodian: {
      type: String,
      trim: true,
    },
    estimatedValue: {
      type: String,
      trim: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret: any) => {
        ret.id = ret._id.toString();
        return ret;
      },
    },
  }
);

export const Asset = mongoose.model<IAsset>("Asset", AssetSchema);
export default Asset;
