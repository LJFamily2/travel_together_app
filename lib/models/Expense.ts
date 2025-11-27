import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISplit {
  userId: mongoose.Types.ObjectId;
  baseAmount: number;
  deduction: number;
  reason?: string;
}

export interface IExpense extends Document {
  journeyId: mongoose.Types.ObjectId;
  payerId: mongoose.Types.ObjectId;
  totalAmount: number;
  imageBinary?: Buffer; // Using Buffer for GridFS or direct storage if small enough, though TODO mentions GridFS
  description: string;
  splits: ISplit[];
  createdAt: Date;
}

const SplitSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  baseAmount: { type: Number, required: true },
  deduction: { type: Number, default: 0 },
  reason: { type: String },
});

const ExpenseSchema: Schema = new Schema(
  {
    journeyId: { type: Schema.Types.ObjectId, ref: "Journey", required: true },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    totalAmount: { type: Number, required: true },
    imageBinary: { type: Buffer }, // Storing directly for now as per schema description, but GridFS is recommended for large files
    description: { type: String, required: true },
    splits: [SplitSchema],
  },
  { timestamps: true }
);

// PERFORMANCE OPTIMIZATION:
ExpenseSchema.index({ journeyId: 1 });

const Expense: Model<IExpense> =
  mongoose.models.Expense || mongoose.model<IExpense>("Expense", ExpenseSchema);

export default Expense;
