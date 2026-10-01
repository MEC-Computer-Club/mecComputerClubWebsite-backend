import { Schema, model, Types } from "mongoose";

export interface IFormField {
  label: string;
  name: string;
  placeholder?: string;
  type: string;
  required: boolean;
  options?: { label: string; value: string }[];
  fileAccept?: string; // e.g. "image/*,.pdf"
  maxFileSizeMb?: number;
}

export interface IForm {
  code?: string;
  title: string;
  eventId?: Types.ObjectId | null;
  description?: string;
  coverImageUrl?: string;
  fields: IFormField[];
  isActive: boolean;
  allowMultipleSubmissions: boolean;
  startDate?: string;
  endDate?: string;
}

const FieldSchema = new Schema<IFormField>(
  {
    label: String,
    name: String,
    placeholder: String,
    type: String,
    required: Boolean,
    fileAccept: String,
    maxFileSizeMb: Number,
    options: [
      {
        label: String,
        value: String,
      },
    ],
  },
  { _id: false }
);

const FormSchema = new Schema<IForm>(
  {
    code: { type: String, unique: true, sparse: true, index: true },
    title: { type: String, required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", default: null },
    description: String,
    coverImageUrl: { type: String, default: "" },
    fields: [FieldSchema],
    isActive: { type: Boolean, default: true },
    allowMultipleSubmissions: { type: Boolean, default: true },
    startDate: {
      type: String,
      default: new Date().toISOString(),
    },
    endDate: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

FormSchema.virtual("status").get(function (this: IForm) {
  const currentDate = new Date().toISOString();
  if (this.endDate && this.endDate < currentDate) {
    return "closed";
  } else if (this.startDate && this.startDate > currentDate) {
    return "draft";
  } else {
    return "published";
  }
});

export default model<IForm>("Form", FormSchema);
