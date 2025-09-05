const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middleware.js/auth");

// 📌 Helper - Password validation
function isValidPassword(password) {
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
  return regex.test(password);
}

// 📌 Calculate age
function calculateAge(dobStr) {
  const dob = new Date(dobStr);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age;
}

// ✅ Register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, password, dob, pin } = req.body;

    if (!name || !phone || !password || !dob || !pin) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    const age = calculateAge(dob);
    if (age < 18)
      return res.status(400).json({ msg: "Must be 18 years or older" });

    if (!isValidPassword(password)) {
      return res
        .status(400)
        .json({
          msg: "Password must be 8+ characters, include uppercase, number, and symbol.",
        });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser)
      return res.status(400).json({ msg: "Phone already registered" });

    const hashedPass = await bcrypt.hash(password, 10);
    const hashedPin = await bcrypt.hash(pin, 10);

    const user = new User({
      name,
      phone,
      password: hashedPass,
      pin: hashedPin,
      dob,
      age,
    });
    await user.save();

    res.status(201).json({ msg: "Registration successful" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", err });
  }
});

// ✅ Login
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone });
  if (!user) return res.status(400).json({ msg: "Invalid phone or password" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch)
    return res.status(400).json({ msg: "Invalid phone or password" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });
  res.json({ token, username: user.name });
});

// ✅ Get Balance
router.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

// ✅ Deposit
router.post("/deposit", auth, async (req, res) => {
  const { amount } = req.body;
  if (amount < 10 || amount > 50000)
    return res.status(400).json({ msg: "Deposit must be ₹10 to ₹50,000" });

  const user = await User.findById(req.user.id);
  user.balance += amount;
  await user.save();

  res.json({ msg: `Deposited ₹${amount}`, balance: user.balance });
});

// ✅ Withdraw
router.post("/withdraw", auth, async (req, res) => {
  const { amount, pin } = req.body;
  if (amount < 10 || amount > 25000)
    return res.status(400).json({ msg: "Withdraw must be ₹10 to ₹25,000" });

  const user = await User.findById(req.user.id);
  const pinMatch = await bcrypt.compare(pin, user.pin);
  if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

  if (user.balance < amount)
    return res.status(400).json({ msg: "Insufficient balance" });

  user.balance -= amount;
  await user.save();

  res.json({ msg: `Withdrawn ₹${amount}`, balance: user.balance });
});

// ✅ Transfer
router.post("/transfer", auth, async (req, res) => {
  const { phone, amount, pin, bankType } = req.body;

  const sender = await User.findById(req.user.id);
  const receiver = await User.findOne({ phone });
  if (!receiver) return res.status(404).json({ msg: "Recipient not found" });

  const pinMatch = await bcrypt.compare(pin, sender.pin);
  if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

  let charge = bankType === "different" ? 11 : 0;
  const total = amount + charge;

  if (sender.balance < total)
    return res.status(400).json({ msg: "Insufficient balance" });

  sender.balance -= total;
  receiver.balance += amount;

  await sender.save();
  await receiver.save();

  res.json({
    msg: `Transferred ₹${amount} to ${phone}${
      charge ? ` (₹${charge} charge)` : ""
    }`,
    balance: sender.balance,
  });
});

// ✅ Top-Up
router.post("/topup", auth, async (req, res) => {
  const { phone, amount, pin } = req.body;
  const user = await User.findById(req.user.id);
  const pinMatch = await bcrypt.compare(pin, user.pin);
  if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

  if (user.balance < amount)
    return res.status(400).json({ msg: "Insufficient balance" });

  user.balance -= amount;
  await user.save();

  res.json({ msg: `Topped up ₹${amount} to ${phone}`, balance: user.balance });
});

// ✅ Load eSewa
router.post("/esewa", auth, async (req, res) => {
  const { id, amount, pin } = req.body;
  const user = await User.findById(req.user.id);
  const pinMatch = await bcrypt.compare(pin, user.pin);
  if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

  if (user.balance < amount)
    return res.status(400).json({ msg: "Insufficient balance" });

  user.balance -= amount;
  await user.save();

  res.json({
    msg: `Loaded ₹${amount} to eSewa ID ${id}`,
    balance: user.balance,
  });
});

// ✅ Change Password
router.post("/change-password", auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch)
    return res.status(400).json({ msg: "Incorrect current password" });

  if (!isValidPassword(newPassword)) {
    return res
      .status(400)
      .json({
        msg: "New password is weak. Use uppercase, number, symbol etc.",
      });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ msg: "Password changed successfully" });
});

module.exports = router;
