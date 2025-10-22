const express = require("express");
const { verifyCredentials, updateUserProfile } = require("../services/userStore");
const { createToken } = require("../utils/token");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Debes proporcionar correo y contraseña." });
    }

    const user = await verifyCredentials(email, password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = createToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user,
    });
  } catch (error) {
    console.error("[auth] Error en login", error);
    res.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const { name, newPassword, currentPassword } = req.body || {};
    const updatedUser = await updateUserProfile(req.user.id, {
      name,
      password: newPassword,
      currentPassword,
    });
    res.json({ user: updatedUser });
  } catch (error) {
    console.error("[auth] Error actualizando perfil", error);
    res
      .status(400)
      .json({
        error: error.message || "No se pudieron actualizar tus datos.",
      });
  }
});

module.exports = router;
