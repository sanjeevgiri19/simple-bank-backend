const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // deposit | withdraw | transfer-out | transfer-in | topup | esewa
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    details: { type: String, default: "" }, // e.g., "to 9812345678" or "from 9812345678"
    balanceAfter: { type: Number }, // snapshot after transaction
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: { type: Date, required: true },
  age: { type: Number, required: true },
  phone: { type: String, unique: true, required: true },
  pin: { type: String, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now },
  transactions: { type: [transactionSchema], default: [] },
});

module.exports = mongoose.model("User", userSchema);
