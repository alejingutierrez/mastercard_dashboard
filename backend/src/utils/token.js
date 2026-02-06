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
const TOKEN_REFRESH_THRESHOLD_SECONDS = Number(
  process.env.DASHBOARD_JWT_REFRESH_THRESHOLD_SECONDS || 3600
);

const createToken = (payload) =>
  jwt.sign(payload, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

const verifyToken = (token) => jwt.verify(token, TOKEN_SECRET);

const shouldRefreshToken = (decoded) => {
  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.exp !== "number"
  ) {
    return false;
  }
  if (
    Number.isNaN(TOKEN_REFRESH_THRESHOLD_SECONDS) ||
    TOKEN_REFRESH_THRESHOLD_SECONDS <= 0
  ) {
    return false;
  }
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const secondsRemaining = decoded.exp - nowInSeconds;
  return secondsRemaining > 0 && secondsRemaining <= TOKEN_REFRESH_THRESHOLD_SECONDS;
};

module.exports = {
  createToken,
  verifyToken,
  shouldRefreshToken,
};
