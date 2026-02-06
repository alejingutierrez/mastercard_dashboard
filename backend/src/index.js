require("dotenv").config();
const express = require("express");
const campaignsRouter = require("./routes/campaigns");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const { initializeUserStore } = require("./services/userStore");

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOriginsSet = new Set(allowedOrigins);
if (allowedOriginsSet.size > 0) {
  console.log(
    "[cors] Orígenes permitidos:",
    Array.from(allowedOriginsSet).join(", ")
  );
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const hasAllowedOrigins = allowedOriginsSet.size > 0;
  const isAllowed =
    !hasAllowedOrigins || !origin || allowedOriginsSet.has(origin);

  if (origin) {
    console.log(
      `[cors] Origin recibido: "${origin}" -> ${
        isAllowed ? "autorizado" : "denegado"
      }`
    );
  }

  if (isAllowed) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Expose-Headers", "X-Dashboard-Token");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    return next();
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(403);
  }
  return res.status(403).json({ error: "Origen no permitido" });
});
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/users", usersRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

initializeUserStore()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`API Mastercard dashboard escuchando en puerto ${port}`);
    });
  })
  .catch((error) => {
    console.error("[startup] Error inicializando el store de usuarios", error);
    process.exit(1);
  });
