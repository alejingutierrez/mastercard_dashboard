const jwt = require("jsonwebtoken");

const TOKEN_SECRET =
  process.env.DASHBOARD_JWT_SECRET ||
  (() => {
    console.warn(
      "[auth] DASHBOARD_JWT_SECRET no está definido. Se usará un secreto inseguro por defecto. Cámbialo en producción."
    );
    return "change-me-in-production";
  })();

const TOKEN_EXPIRES_IN = process.env.DASHBOARD_JWT_EXPIRES_IN || "8h";

const createToken = (payload) =>
  jwt.sign(payload, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

const verifyToken = (token) => jwt.verify(token, TOKEN_SECRET);

module.exports = {
  createToken,
  verifyToken,
};
