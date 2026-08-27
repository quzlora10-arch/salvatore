const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SECRET = process.env.JWT_SECRET || "CHANGE_ME";

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.indexOf("Bearer ") === 0 ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Giriş yapmanız gerekiyor." });

  try {
    req.auth = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
  }
}

function adminRequired(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    return res.status(403).json({ error: "Yönetici yetkisi gerekiyor." });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  tokenFor,
  authRequired,
  adminRequired
};
