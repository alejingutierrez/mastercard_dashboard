const express = require("express");
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  findUserByIdInternal,
} = require("../services/userStore");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error("[users] Error listando usuarios", error);
    res.status(500).json({ error: "No se pudo obtener la lista de usuarios." });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      email,
      name,
      role,
      password,
      allowedCampaignIds,
      forcePasswordReset,
    } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son obligatorios." });
    }

    const user = await createUser({
      email,
      name,
      role,
      password,
      allowedCampaignIds,
      forcePasswordReset,
    });
    res.status(201).json({ user });
  } catch (error) {
    console.error("[users] Error creando usuario", error);
    res
      .status(400)
      .json({ error: error.message || "No se pudo crear el usuario." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      role,
      password,
      allowedCampaignIds,
      forcePasswordReset,
    } = req.body || {};

    if (req.user.id === id && role && role !== "admin") {
      return res
        .status(400)
        .json({ error: "No puedes degradar el rol de tu propia cuenta." });
    }

    if (role === "viewer") {
      const users = await getAllUsers();
      const adminCount = users.filter((user) => user.role === "admin").length;
      const targetUser = users.find((user) => user.id === id);
      if (targetUser?.role === "admin" && adminCount <= 1) {
        return res
          .status(400)
          .json({
            error: "Debe existir al menos un usuario administrador activo.",
          });
      }
    }

    const user = await updateUser(id, {
      name,
      role,
      password,
      allowedCampaignIds,
      forcePasswordReset,
    });
    res.json({ user });
  } catch (error) {
    console.error("[users] Error actualizando usuario", error);
    res
      .status(400)
      .json({ error: error.message || "No se pudo actualizar el usuario." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
    }

    const targetUser = await findUserByIdInternal(id);
    if (!targetUser) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    if (targetUser.role === "admin") {
      const users = await getAllUsers();
      const adminCount = users.filter((user) => user.role === "admin").length;
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ error: "Debe existir al menos un usuario administrador activo." });
      }
    }

    await deleteUser(id);
    res.status(204).send();
  } catch (error) {
    console.error("[users] Error eliminando usuario", error);
    res.status(500).json({ error: "No se pudo eliminar el usuario." });
  }
});

module.exports = router;
