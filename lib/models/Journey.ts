import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICurrencyConfig {
  code: string;        // ISO 4217, e.g. "THB"
  name: string;        // e.g. "Thai Baht"
  symbol: string;      // e.g. "฿"
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "TH"
  exchangeRate: number; // How many of this currency = 1 base currency unit
}

export interface IBaseCurrency {
  code: string;
  name: string;
  symbol: string;
  countryCode: string;
}

export interface IJourney extends Document {
  name: string;
  slug: string;
  startDate?: Date;
  endDate?: Date;
  leaderId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  pendingMembers: mongoose.Types.ObjectId[];
  rejectedMembers: mongoose.Types.ObjectId[];
  password?: string;
  requireApproval: boolean;
  isLocked: boolean; // Locks invitation
  isInputLocked: boolean; // Locks expenses/inputs
  status: "active" | "complete";
  createdAt: Date;
  expireAt?: Date;
  // Multi-currency support
  baseCurrency?: IBaseCurrency;
  currencies?: ICurrencyConfig[];
  // Single active join token metadata
  joinTokenJti?: string;
  joinTokenExpiresAt?: Date;
  joinTokenUsed?: boolean;
}

const CurrencyConfigSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    countryCode: { type: String, required: true },
    exchangeRate: { type: Number, required: true },
  },
  { _id: false }
);

const BaseCurrencySchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    countryCode: { type: String, required: true },
  },
  { _id: false }
);

const JourneySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    leaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    pendingMembers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    rejectedMembers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    password: { type: String },
    requireApproval: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    isInputLocked: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "complete"], default: "active" },
    expireAt: { type: Date },
    // Multi-currency support
    baseCurrency: { type: BaseCurrencySchema },
    currencies: { type: [CurrencyConfigSchema], default: [] },
    // Token metadata - used for single-active token or revocation
    joinTokenJti: { type: String },
    joinTokenExpiresAt: { type: Date },
    joinTokenUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// TTL Index: Documents will be automatically deleted when the current time matches 'expireAt'
JourneySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// Delete the model from cache if it exists (for dev hot-reload)
if (process.env.NODE_ENV !== "production" && mongoose.models.Journey) {
  delete mongoose.models.Journey;
}

const Journey: Model<IJourney> =
  mongoose.models.Journey || mongoose.model<IJourney>("Journey", JourneySchema);

export default Journey;
