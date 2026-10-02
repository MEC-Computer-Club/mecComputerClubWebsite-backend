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
  closingTime?: string;
}

/**
 * Parses the form closing date & time into an accurate Date object.
 * Supports standard YYYY-MM-DD + HH:mm (or 12-hour AM/PM) with Bangladesh Standard Time (UTC+6) attribution.
 * If no closing time is specified, defaults to 23:59:59 on the closing date.
 */
export function parseFormClosingDate(endDate?: string, closingTime?: string): Date | null {
  if (!endDate || !endDate.trim()) return null;

  // If already an ISO string with time
  if (endDate.includes("T")) {
    const d = new Date(endDate);
    return isNaN(d.getTime()) ? null : d;
  }

  const parts = endDate.trim().split("-");
  if (parts.length !== 3) {
    const d = new Date(endDate);
    return isNaN(d.getTime()) ? null : d;
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  let hours = 23;
  let minutes = 59;
  let seconds = 59;

  if (closingTime && closingTime.trim()) {
    const timeMatch = closingTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const meridiem = timeMatch[4]?.toUpperCase();

      if (meridiem === "PM" && h < 12) h += 12;
      if (meridiem === "AM" && h === 12) h = 0;

      hours = h;
      minutes = m;
      seconds = s;
    }
  }

  // Explicitly attribute to Bangladesh Standard Time (UTC+06:00)
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoBst = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+06:00`;
  const parsed = new Date(isoBst);
  return isNaN(parsed.getTime()) ? new Date(year, month, day, hours, minutes, seconds) : parsed;
}

export function isFormClosed(form: { endDate?: string; closingTime?: string; isActive?: boolean }): boolean {
  if (form.isActive === false) return true;
  const closingDate = parseFormClosingDate(form.endDate, form.closingTime);
  if (!closingDate) return false;
  return Date.now() >= closingDate.getTime();
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
      default: () => new Date().toISOString(),
    },
    endDate: {
      type: String,
    },
    closingTime: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

FormSchema.virtual("status").get(function (this: IForm) {
  if (this.isActive === false) return "closed";
  if (isFormClosed(this)) return "closed";
  if (this.startDate) {
    const start = new Date(this.startDate);
    if (!isNaN(start.getTime()) && Date.now() < start.getTime()) {
      return "draft";
    }
  }
  return "published";
});

FormSchema.virtual("isClosed").get(function (this: IForm) {
  return isFormClosed(this);
});

FormSchema.virtual("closingDateFormatted").get(function (this: IForm) {
  const d = parseFormClosingDate(this.endDate, this.closingTime);
  return d ? d.toISOString() : null;
});

export default model<IForm>("Form", FormSchema);
