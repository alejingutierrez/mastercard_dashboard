const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { CAMPAIGNS } = require("../config/campaigns");

const USERS_FILE =
  process.env.DASHBOARD_USERS_FILE ||
  path.join(__dirname, "../data/dashboardUsers.json");
const HASH_ROUNDS = Number(process.env.DASHBOARD_BCRYPT_ROUNDS || 10);
const ALL_CAMPAIGN_IDS = CAMPAIGNS.map((campaign) => campaign.id);

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase();
};

const normalizeAllowedCampaignIds = (values) => {
  if (!Array.isArray(values)) {
    return null;
  }
  const validSet = new Set(ALL_CAMPAIGN_IDS);
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : String(value)))
    .filter((value) => value.length > 0 && validSet.has(value));

  if (normalized.length === 0) {
    return null;
  }

  return Array.from(new Set(normalized));
};

const applyUserDefaults = (user) => {
  const normalizedAllowed =
    normalizeAllowedCampaignIds(user.allowedCampaignIds) || ALL_CAMPAIGN_IDS;
  const currentAllowed = Array.isArray(user.allowedCampaignIds)
    ? user.allowedCampaignIds
    : [];
  const allowedMatches =
    currentAllowed.length === normalizedAllowed.length &&
    currentAllowed.every((value, index) => value === normalizedAllowed[index]);

  const mustResetPassword =
    typeof user.mustResetPassword === "boolean"
      ? user.mustResetPassword
      : false;

  if (allowedMatches && mustResetPassword === user.mustResetPassword) {
    return user;
  }

  return {
    ...user,
    allowedCampaignIds: allowedMatches
      ? currentAllowed
      : normalizedAllowed.slice(),
    mustResetPassword,
  };
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const {
    passwordHash,
    emailNormalized,
    allowedCampaignIds,
    mustResetPassword,
    ...rest
  } = user;
  const normalizedAllowedCampaignIds =
    normalizeAllowedCampaignIds(allowedCampaignIds) || ALL_CAMPAIGN_IDS;
  return {
    ...rest,
    allowedCampaignIds: normalizedAllowedCampaignIds,
    mustResetPassword: Boolean(mustResetPassword),
  };
};

const readUsersFile = async () => {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    console.error("[userStore] Error leyendo archivo de usuarios", error);
    throw error;
  }
};

const writeUsersFile = async (users) => {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
};

const ensureAdminSeed = async (users) => {
  const hasAdmin = users.some(
    (user) => user.role === "admin" && user.status !== "deleted"
  );
  if (hasAdmin) {
    return users;
  }

  const defaultEmail =
    normalizeEmail(process.env.DASHBOARD_ADMIN_EMAIL) || "admin@dashboard.local";
  const adminName = process.env.DASHBOARD_ADMIN_NAME?.trim() || "Administrador";
  const defaultPassword =
    process.env.DASHBOARD_ADMIN_PASSWORD || "ChangeMe123!";

  if (!process.env.DASHBOARD_ADMIN_PASSWORD) {
    console.warn(
      "[userStore] DASHBOARD_ADMIN_PASSWORD no está definido. Se usará la contraseña por defecto 'ChangeMe123!'. Cámbiala inmediatamente en producción."
    );
  }

  const timestamp = new Date().toISOString();
  const adminUser = {
    id: randomUUID(),
    email: defaultEmail,
    emailNormalized: defaultEmail,
    name: adminName,
    role: "admin",
    status: "active",
    passwordHash: await bcrypt.hash(defaultPassword, HASH_ROUNDS),
    createdAt: timestamp,
    updatedAt: timestamp,
    allowedCampaignIds: ALL_CAMPAIGN_IDS,
    mustResetPassword: false,
  };

  console.log(
    `[userStore] Usuario administrador inicial creado (${adminUser.email}).`
  );

  return [...users, adminUser];
};

const normalizeAllUsersOnDisk = async () => {
  const users = await readUsersFile();
  let changed = false;
  const normalizedUsers = users.map((user) => {
    const next = applyUserDefaults(user);
    if (next !== user) {
      changed = true;
    }
    return next;
  });
  if (changed) {
    await writeUsersFile(normalizedUsers);
  }
};

const initializeUserStore = async () => {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  let users = await readUsersFile();
  users = users.filter(Boolean);
  const seededUsers = await ensureAdminSeed(users);
  if (seededUsers !== users) {
    await writeUsersFile(seededUsers);
  }
  await normalizeAllUsersOnDisk();
};

const getAllUsersInternal = async () => {
  const users = await readUsersFile();
  return users.filter((user) => user.status !== "deleted");
};

const getAllUsers = async () => {
  const users = await getAllUsersInternal();
  return users.map(sanitizeUser);
};

const findUserByIdInternal = async (id) => {
  if (!id) {
    return null;
  }
  const users = await readUsersFile();
  const index = users.findIndex(
    (user) => user.id === id && user.status !== "deleted"
  );
  if (index === -1) {
    return null;
  }
  const normalized = applyUserDefaults(users[index]);
  if (normalized !== users[index]) {
    users[index] = normalized;
    await writeUsersFile(users);
  }
  return normalized;
};

const findUserByEmailInternal = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const users = await readUsersFile();
  const index = users.findIndex(
    (user) =>
      user.emailNormalized === normalized && user.status !== "deleted"
  );
  if (index === -1) {
    return null;
  }
  const normalizedUser = applyUserDefaults(users[index]);
  if (normalizedUser !== users[index]) {
    users[index] = normalizedUser;
    await writeUsersFile(users);
  }
  return normalizedUser;
};

const verifyCredentials = async (email, password) => {
  const user = await findUserByEmailInternal(email);
  if (!user) {
    return null;
  }
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }
  return sanitizeUser(user);
};

const createUser = async ({
  email,
  name,
  role,
  password,
  allowedCampaignIds,
  forcePasswordReset,
}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("El correo electrónico es requerido");
  }

  if (typeof password !== "string" || password.trim().length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const existing = await findUserByEmailInternal(normalizedEmail);
  if (existing) {
    throw new Error("Ya existe un usuario con ese correo electrónico");
  }

  const requestedCampaignIds = normalizeAllowedCampaignIds(allowedCampaignIds);
  if (allowedCampaignIds !== undefined && !requestedCampaignIds) {
    throw new Error("Debes asignar al menos una campaña válida.");
  }
  const campaignIds = requestedCampaignIds
    ? requestedCampaignIds.slice()
    : ALL_CAMPAIGN_IDS.slice();

  const users = await readUsersFile();
  const timestamp = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: normalizedEmail,
    emailNormalized: normalizedEmail,
    name: name?.trim() || normalizedEmail,
    role: role === "admin" ? "admin" : "viewer",
    status: "active",
    passwordHash: await bcrypt.hash(password, HASH_ROUNDS),
    createdAt: timestamp,
    updatedAt: timestamp,
    allowedCampaignIds: campaignIds,
    mustResetPassword: Boolean(
      forcePasswordReset === undefined ? true : forcePasswordReset
    ),
  };

  users.push(user);
  await writeUsersFile(users);
  return sanitizeUser(user);
};

const updateUser = async (
  id,
  { name, role, password, allowedCampaignIds, forcePasswordReset }
) => {
  const users = await readUsersFile();
  const index = users.findIndex(
    (user) => user.id === id && user.status !== "deleted"
  );
  if (index === -1) {
    throw new Error("Usuario no encontrado");
  }

  const baseUser = applyUserDefaults(users[index]);
  if (baseUser !== users[index]) {
    users[index] = baseUser;
  }
  const user = { ...baseUser };
  let modified = false;

  if (allowedCampaignIds !== undefined) {
    const normalizedAllowed = normalizeAllowedCampaignIds(allowedCampaignIds);
    if (!normalizedAllowed) {
      throw new Error("Debes asignar al menos una campaña válida.");
    }
    user.allowedCampaignIds = normalizedAllowed.slice();
    modified = true;
  }

  if (typeof name === "string" && name.trim() && name !== user.name) {
    user.name = name.trim();
    modified = true;
  }

  if (role && role !== user.role) {
    user.role = role === "admin" ? "admin" : "viewer";
    modified = true;
  }

  if (typeof password === "string" && password.trim().length > 0) {
    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    user.passwordHash = await bcrypt.hash(trimmedPassword, HASH_ROUNDS);
    user.mustResetPassword =
      forcePasswordReset === undefined ? true : Boolean(forcePasswordReset);
    modified = true;
  } else if (forcePasswordReset !== undefined) {
    user.mustResetPassword = Boolean(forcePasswordReset);
    modified = true;
  }

  if (!modified) {
    return sanitizeUser(user);
  }

  user.updatedAt = new Date().toISOString();
  users[index] = user;
  await writeUsersFile(users);
  return sanitizeUser(user);
};

const updateUserProfile = async (
  id,
  { name, password, currentPassword }
) => {
  const users = await readUsersFile();
  const index = users.findIndex(
    (user) => user.id === id && user.status !== "deleted"
  );
  if (index === -1) {
    throw new Error("Usuario no encontrado");
  }

  const baseUser = applyUserDefaults(users[index]);
  if (baseUser !== users[index]) {
    users[index] = baseUser;
  }
  const user = { ...baseUser };
  let modified = false;

  if (typeof name === "string" && name.trim() && name !== user.name) {
    user.name = name.trim();
    modified = true;
  }

  if (typeof password === "string" && password.trim()) {
    const trimmedPassword = password.trim();
    if (!currentPassword || typeof currentPassword !== "string") {
      throw new Error("Debes indicar tu contraseña actual para actualizarla.");
    }

    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!isCurrentValid) {
      throw new Error("La contraseña actual no es correcta.");
    }

    if (trimmedPassword.length < 8) {
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    }

    user.passwordHash = await bcrypt.hash(trimmedPassword, HASH_ROUNDS);
    user.mustResetPassword = false;
    modified = true;
  }

  if (!modified) {
    return sanitizeUser(user);
  }

  user.updatedAt = new Date().toISOString();
  users[index] = user;
  await writeUsersFile(users);
  return sanitizeUser(user);
};

const deleteUser = async (id) => {
  const users = await readUsersFile();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    throw new Error("Usuario no encontrado");
  }

  users.splice(index, 1);
  await writeUsersFile(users);
};

module.exports = {
  initializeUserStore,
  getAllUsers,
  verifyCredentials,
  findUserByIdInternal,
  findUserByEmailInternal,
  createUser,
  updateUser,
  updateUserProfile,
  deleteUser,
  sanitizeUser,
};
