const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const tokenHeader = req.header("Authorization");
  if (!tokenHeader)
    return res.status(401).json({ msg: "No token, access denied." });

  try {
    const token = tokenHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(400).json({ msg: "Invalid token." });
  }
}

module.exports = auth;
