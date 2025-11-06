const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middleware.js/auth");

// Helper - Password validation
function isValidPassword(password) {
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
  return regex.test(password);
}

// Calculate age
function calculateAge(dobStr) {
  const dob = new Date(dobStr);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age;
}

// SALT ROUNDS
const SALT_ROUNDS = 10;

// Register
router.post("/register", async (req, res) => {
  try {
    let { name, phone, password, dob, pin } = req.body;

    if (!name || !phone || !password || !dob || !pin) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    // Normalize simple inputs
    phone = String(phone).trim();
    pin = String(pin).trim();

    const age = calculateAge(dob);
    if (age < 18)
      return res.status(400).json({ msg: "Must be 18 years or older" });

    if (!isValidPassword(password)) {
      return res.status(400).json({
        msg: "Password must be 8+ characters, include uppercase, number, and symbol.",
      });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser)
      return res.status(400).json({ msg: "Phone already registered" });

    // Hash password and PIN
    const hashedPass = await bcrypt.hash(password, SALT_ROUNDS);
    const hashedPin = await bcrypt.hash(pin, SALT_ROUNDS);

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
    console.error("Register error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

//  Login
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({ msg: "Please enter all fields" });
    }

    // Find user and include password (if schema hides it)
    const user = await User.findOne({ phone }).select("+password");
    if (!user) {
      return res.status(400).json({ msg: "User does not exist" });
    }

    // Compare hashed password
    const passMatch = await bcrypt.compare(password, user.password);
    if (!passMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Send response
    res.json({
      token,
      name: user.name,
      phone: user.phone,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
});

// Get Balance
router.get("/balance", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

//  Deposit (no PIN; records transaction)
router.post("/deposit", auth, async (req, res) => {
  const { amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt < 10 || amt > 50000)
    return res.status(400).json({ msg: "Deposit must be ₹10 to ₹50,000" });

  const user = await User.findById(req.user.id);
  user.balance += amt;

  user.transactions.push({
    type: "deposit",
    amount: amt,
    details: `Deposited ₹${amt}`,
    balanceAfter: user.balance,
  });

  await user.save();

  res.json({ msg: `Deposited ₹${amt}`, balance: user.balance });
});

// ---------------- WITHDRAW ----------------
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    let { pin } = req.body;
    const amt = Number(amount);

    if (!amt || amt < 10 || amt > 25000)
      return res.status(400).json({ msg: "Withdraw must be Rs.10 to RS.25,000" });

    // Get user and include pin explicitly (if schema has select:false)
    const user = await User.findById(req.user.id).select("+pin");
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Ensure pin is a string and trimmed
    pin = pin != null ? String(pin).trim() : "";
    if (!pin) return res.status(400).json({ msg: "PIN is required" });

    // Compare hashed PIN
    const pinMatch = await bcrypt.compare(pin, user.pin);
    if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

    if (user.balance < amt) return res.status(400).json({ msg: "Insufficient balance" });

    user.balance -= amt;
    user.transactions.push({
      type: "withdraw",
      amount: amt,
      details: `Withdrawn ₹${amt}`,
      balanceAfter: user.balance,
    });

    await user.save();
    res.json({ msg: `Withdrawn ₹${amt}`, balance: user.balance });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

//  Transfer (requires PIN; charges for different bank; records for both users)
router.post("/transfer", auth, async (req, res) => {
  try {
    const { phone, amount, pin, bankType } = req.body;
    const amt = Number(amount);

    // Get sender with PIN and receiver normally
    const sender = await User.findById(req.user.id).select("+pin");
    const receiver = await User.findOne({ phone });
    if (!receiver) return res.status(404).json({ msg: "Recipient not found" });
    if (!sender) return res.status(404).json({ msg: "Sender not found" });

    const pinStr = String(pin || "").trim();
    const pinMatch = await bcrypt.compare(pinStr, sender.pin);
    if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

    let charge = bankType === "different" ? 11 : 0;
    const total = amt + charge;

    if (!amt || amt < 10 || amt > 25000) {
      return res
        .status(400)
        .json({ msg: "Transfer amount must be ₹10 to ₹25,000" });
    }

    if (sender.balance < total)
      return res.status(400).json({ msg: "Insufficient balance" });

    // Perform transfer
    sender.balance -= total;
    receiver.balance += amt;

    sender.transactions.push({
      type: "transfer-out",
      amount: amt,
      details: `To ${phone}${charge ? ` (₹${charge} fee)` : ""}`,
      balanceAfter: sender.balance,
    });

    receiver.transactions.push({
      type: "transfer-in",
      amount: amt,
      details: `From ${sender.phone}`,
      balanceAfter: receiver.balance,
    });

    await sender.save();
    await receiver.save();

    res.json({
      msg: `Transferred ₹${amt} to ${phone}${charge ? ` (₹${charge} charge)` : ""}`,
      balance: sender.balance,
    });
  } catch (err) {
    console.error("Transfer error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

// Top-Up (requires PIN; records transaction)
router.post("/topup", auth, async (req, res) => {
  try {
    const { phone, amount, pin } = req.body;
    const amt = Number(amount);

    const user = await User.findById(req.user.id).select("+pin");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const pinStr = String(pin || "").trim();
    const pinMatch = await bcrypt.compare(pinStr, user.pin);
    if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

    if (!amt || amt < 10)
      return res.status(400).json({ msg: "Minimum top-up is ₹10" });
    if (user.balance < amt)
      return res.status(400).json({ msg: "Insufficient balance" });

    user.balance -= amt;

    user.transactions.push({
      type: "topup",
      amount: amt,
      details: `Mobile top-up to ${phone}`,
      balanceAfter: user.balance,
    });

    await user.save();

    res.json({ msg: `Topped up ₹${amt} to ${phone}`, balance: user.balance });
  } catch (err) {
    console.error("Topup error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

// Load eSewa (requires PIN; records transaction)
router.post("/esewa", auth, async (req, res) => {
  try {
    const { id, amount, pin } = req.body;
    const amt = Number(amount);

    const user = await User.findById(req.user.id).select("+pin");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const pinStr = String(pin || "").trim();
    const pinMatch = await bcrypt.compare(pinStr, user.pin);
    if (!pinMatch) return res.status(400).json({ msg: "Invalid PIN" });

    if (!amt || amt < 10)
      return res.status(400).json({ msg: "Minimum load is ₹10" });
    if (user.balance < amt)
      return res.status(400).json({ msg: "Insufficient balance" });

    user.balance -= amt;

    user.transactions.push({
      type: "esewa",
      amount: amt,
      details: `Loaded to eSewa ID ${id}`,
      balanceAfter: user.balance,
    });

    await user.save();

    res.json({
      msg: `Loaded ₹${amt} to eSewa ID ${id}`,
      balance: user.balance,
    });
  } catch (err) {
    console.error("eSewa error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

//  Change Password
router.post("/change-password", auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");
    if (!user) return res.status(404).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword || "", user.password);
    if (!isMatch) return res.status(400).json({ msg: "Incorrect current password" });

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        msg: "New password is weak. Use uppercase, number, symbol etc.",
      });
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

    res.json({ msg: "Password changed successfully" });
  } catch (err) {
    console.error("Change-password error:", err);
    res.status(500).json({ msg: "Server error", err: err.message });
  }
});

//  Get profile (auth protected; returns public fields)
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -pin");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

//  Get transaction history (auth protected; newest first)
router.get("/transactions", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("transactions");
    if (!user) return res.status(404).json({ msg: "User not found" });
    const list = [...user.transactions].reverse();
    res.json(list);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
