const { createToken, verifyToken, shouldRefreshToken } = require("../utils/token");
const { findUserByIdInternal, sanitizeUser } = require("../services/userStore");

const extractToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const decoded = verifyToken(token);
    const user = await findUserByIdInternal(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: "Usuario no válido" });
    }

    const sanitizedUser = sanitizeUser(user);
    req.user = sanitizedUser;

    if (shouldRefreshToken(decoded)) {
      const refreshedToken = createToken({
        sub: sanitizedUser.id,
        role: sanitizedUser.role,
      });
      res.setHeader("X-Dashboard-Token", refreshedToken);
    }

    next();
  } catch (error) {
    console.error("[auth] Error validando token", error);
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Acceso restringido" });
  }
  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
};
