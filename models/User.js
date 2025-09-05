const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: { type: Date, required: true },
  age: { type: Number, required: true },
  phone: { type: String, unique: true, required: true },
  pin: { type: String, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 100 },
});

module.exports = mongoose.model("User", userSchema);
