import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  Layout,
  Menu,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuProps } from "antd";
import type { RangePickerProps } from "antd/es/date-picker";
import {
  AppstoreOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  PieChartOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type {
  ActivityResponse,
  Campaign,
  CampaignSummaryResponse,
  LoginSecurityResponse,
  RedemptionInsightsResponse,
  DashboardUser,
} from "../types";
import {
  fetchCampaigns,
  fetchCampaignSummary,
  fetchCampaignActivity,
  fetchCampaignRedemptionInsights,
  fetchCampaignLoginSecurity,
  type SummaryFilters,
} from "../api/campaigns";
import { updateCurrentUserProfile } from "../api/auth";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/users";
import ActivitySection from "./dashboard/ActivitySection";
import LoginSecuritySection from "./dashboard/LoginSecuritySection";
import RedemptionsSection from "./dashboard/RedemptionsSection";
import UserManagementSection from "./dashboard/UserManagementSection";
import {
  MIN_PASSWORD_LENGTH,
  ROLE_LABELS,
  buildActivityDataset,
  buildActivityWithCumulative,
  buildLoginHeatmapData,
  buildLoginSecurityAtypicalRows,
  buildLoginSecurityDetailRows,
  buildLoginSecurityTopIps,
  buildLoginTypeDistribution,
  buildLoginTypeLabelMap,
  buildMerchantPieData,
  buildMetricsByKey,
  buildRedemptionAmountChartData,
  buildRedemptionHeatmapData,
  buildRedemptionTableData,
  buildUserTableData,
  calculateActivityAxisExtents,
  createLoginSecurityAtypicalColumns,
  createLoginSecurityDetailColumns,
  createRedemptionTableColumns,
  createUserColumns,
  formatValue,
} from "./dashboard/dataTransforms";
import { exportExcel } from "../utils/exportExcel";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

type MenuKey =
  | "overview"
  | "redemptions"
  | "login-security"
  | "user-management";

interface DashboardProps {
  currentUser: DashboardUser;
  onLogout: () => void;
  onUserUpdate: (user: DashboardUser) => void;
}

interface UserFormValues {
  email: string;
  name?: string;
  role: "admin" | "viewer";
  password?: string;
  allowedCampaignIds?: string[];
  forcePasswordReset?: boolean;
}

interface ProfileFormValues {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

const extractApiError = (err: unknown): string => {
  const apiMessage = (err as { response?: { data?: { error?: string } } })
    ?.response?.data?.error;
  if (apiMessage) {
    return apiMessage;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Ocurrió un error inesperado.";
};

const generateTemporaryPassword = (length = 12) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    result += alphabet.charAt(randomIndex);
  }
  return result;
};

type KpiFormat = "number" | "currency";

interface KpiDefinition {
  key: string;
  label: string;
  format?: KpiFormat;
  help?: string;
}

const KPI_DEFINITIONS: KpiDefinition[] = [
  {
    key: "totalUsers",
    label: "Usuarios totales",
    help: "Usuarios únicos disponibles en el universo de la campaña (no necesariamente con actividad).",
  },
  {
    key: "totalLogins",
    label: "Logins totales",
    help: "Total de eventos de login registrados para los filtros seleccionados.",
  },
  {
    key: "usersWithLogin",
    label: "Usuarios con login",
    help: "Usuarios únicos que realizaron al menos un login.",
  },
  {
    key: "redemptionAttempts",
    label: "Intentos de redención",
    help: "Total de intentos de redención (incluye intentos fallidos y sin idmask).",
  },
  {
    key: "totalRedemptions",
    label: "Redenciones válidas",
    help: "Redenciones aprobadas o exitosas (excluye intentos fallidos).",
  },
  {
    key: "totalWinners",
    label: "Ganadores totales",
    help: "Usuarios únicos con al menos una redención válida.",
  },
  {
    key: "totalRedeemedValue",
    label: "Valor acumulado en redenciones",
    format: "currency",
    help: "Suma del valor (COP) redimido en redenciones válidas.",
  },
];

const LOGIN_TYPE_OPTIONS = [
  { value: "0", label: "Login no exitoso (0)" },
  { value: "1", label: "Login exitoso (1)" },
  { value: "2", label: "Autologin (2)" },
];

const Dashboard = ({ currentUser, onLogout, onUserUpdate }: DashboardProps) => {
  const { message } = AntdApp.useApp();
  const screens = Grid.useBreakpoint();
  const isDesktop =
    screens.lg ?? (typeof window !== "undefined" ? window.innerWidth >= 992 : true);
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>();
  const [loginType, setLoginType] = useState<string>();
  const [userIdFilter, setUserIdFilter] = useState<string>();
  const [userIpFilter, setUserIpFilter] = useState<string>();
  const [userIdInput, setUserIdInput] = useState("");
  const [userIpInput, setUserIpInput] = useState("");
  const [summary, setSummary] = useState<CampaignSummaryResponse | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string>();
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string>();
  const [redemptionInsights, setRedemptionInsights] =
    useState<RedemptionInsightsResponse | null>(null);
  const [loadingRedemptionInsights, setLoadingRedemptionInsights] =
    useState(false);
  const [redemptionError, setRedemptionError] = useState<string>();
  const [loginSecurity, setLoginSecurity] =
    useState<LoginSecurityResponse | null>(null);
  const [loadingLoginSecurity, setLoadingLoginSecurity] = useState(false);
  const [loginSecurityError, setLoginSecurityError] = useState<string>();
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string>();
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [userModalSubmitting, setUserModalSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userForm] = Form.useForm<UserFormValues>();
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const mustChangePassword = currentUser.mustResetPassword;
  const userDisplayName = currentUser.name || currentUser.email;
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => {
    if (isDesktop) {
      setMobileNavOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    const storageKey = `dashboard_state_v1:${currentUser.id}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        version?: number;
        selectedMenu?: MenuKey;
        collapsed?: boolean;
        selectedCampaign?: string;
        dateRange?: { from: string; to: string } | null;
        loginType?: string | null;
        userId?: string | null;
        userIp?: string | null;
      };

      if (parsed?.version !== 1) {
        return;
      }

      if (typeof parsed.collapsed === "boolean") {
        setCollapsed(parsed.collapsed);
      }

      if (parsed.selectedMenu) {
        const nextMenu =
          currentUser.role !== "admin" && parsed.selectedMenu === "user-management"
            ? "overview"
            : parsed.selectedMenu;
        setSelectedMenu(nextMenu);
      }

      if (typeof parsed.selectedCampaign === "string" && parsed.selectedCampaign.trim()) {
        setSelectedCampaign(parsed.selectedCampaign.trim());
      }

      if (parsed.dateRange?.from && parsed.dateRange?.to) {
        const start = dayjs(parsed.dateRange.from, "YYYY-MM-DD", true);
        const end = dayjs(parsed.dateRange.to, "YYYY-MM-DD", true);
        if (start.isValid() && end.isValid()) {
          setDateRange([start, end]);
        }
      }

      if (typeof parsed.loginType === "string" && parsed.loginType.trim()) {
        setLoginType(parsed.loginType.trim());
      }

      if (typeof parsed.userId === "string" && parsed.userId.trim()) {
        const trimmed = parsed.userId.trim();
        setUserIdFilter(trimmed);
        setUserIdInput(trimmed);
      }

      if (typeof parsed.userIp === "string" && parsed.userIp.trim()) {
        const trimmed = parsed.userIp.trim();
        setUserIpFilter(trimmed);
        setUserIpInput(trimmed);
      }
    } catch (err) {
      console.warn("[dashboard] Failed to restore persisted state", err);
    }
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    const storageKey = `dashboard_state_v1:${currentUser.id}`;
    const payload = {
      version: 1,
      selectedMenu,
      collapsed,
      selectedCampaign,
      dateRange: dateRange
        ? {
            from: dateRange[0].format("YYYY-MM-DD"),
            to: dateRange[1].format("YYYY-MM-DD"),
          }
        : null,
      loginType: loginType ?? null,
      userId: userIdFilter ?? null,
      userIp: userIpFilter ?? null,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn("[dashboard] Failed to persist state", err);
    }
  }, [
    currentUser.id,
    selectedMenu,
    collapsed,
    selectedCampaign,
    dateRange,
    loginType,
    userIdFilter,
    userIpFilter,
  ]);

  const allCampaignIds = useMemo(
    () => campaigns.map((campaign) => campaign.id),
    [campaigns],
  );

  const userCampaignOptions = useMemo(
    () =>
      campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.id,
      })),
    [campaigns],
  );

  const campaignNameMap = useMemo(() => {
    const map = new Map<string, string>();
    campaigns.forEach((campaign) => {
      map.set(campaign.id, campaign.name);
    });
    return map;
  }, [campaigns]);

  const totalCampaignCount = campaigns.length;

  const menuItems = useMemo<MenuProps["items"]>(() => {
    const items: MenuProps["items"] = [
      {
        key: "overview",
        label: "Overview",
        icon: <AppstoreOutlined />,
      },
      {
        key: "redemptions",
        label: "Redenciones",
        icon: <PieChartOutlined />,
      },
      {
        key: "login-security",
        label: "Logins y seguridad",
        icon: <SafetyCertificateOutlined />,
      },
    ];

    if (currentUser.role === "admin") {
      items.push({
        key: "user-management",
        label: "Usuarios",
        icon: <TeamOutlined />,
      });
    }

    return items;
  }, [currentUser.role]);

  const userMenuItems = useMemo<MenuProps["items"]>(() => {
    const items: MenuProps["items"] = [
      {
        key: "profile",
        label: "Mi perfil",
        icon: <UserOutlined />,
      },
      {
        type: "divider",
      },
      {
        key: "logout",
        label: "Cerrar sesión",
        icon: <LogoutOutlined />,
        danger: true,
      },
    ];

    if (mustChangePassword) {
      items.unshift({
        key: "password-warning",
        disabled: true,
        label: (
          <Text type="danger" style={{ fontSize: 12 }}>
            Debes actualizar tu contraseña
          </Text>
        ),
      });
    }

    return items;
  }, [mustChangePassword]);

  useEffect(() => {
    if (currentUser.role !== "admin" && selectedMenu === "user-management") {
      setSelectedMenu("overview");
    }
  }, [currentUser.role, selectedMenu]);

  const openProfileModal = useCallback(() => {
    profileForm.setFieldsValue({
      name: currentUser.name ?? "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setProfileModalVisible(true);
  }, [profileForm, currentUser.name]);

  useEffect(() => {
    if (mustChangePassword && !profileModalVisible) {
      openProfileModal();
    }
  }, [mustChangePassword, profileModalVisible, openProfileModal]);

  useEffect(() => {
    if (!userModalVisible) {
      return;
    }
    if (!editingUser) {
      userForm.setFieldsValue({
        allowedCampaignIds: allCampaignIds,
      });
    }
  }, [userModalVisible, editingUser, allCampaignIds, userForm]);

  const loadUsersList = useCallback(async () => {
    setUsersError(undefined);
    setLoadingUsers(true);
    try {
      const fetchedUsers = await fetchUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      setUsersError(extractApiError(err));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const handleOpenCreateUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({
      email: "",
      name: "",
      role: "viewer",
      password: "",
      allowedCampaignIds: allCampaignIds,
      forcePasswordReset: true,
    });
    setUserModalVisible(true);
  };

  const handleOpenEditUser = useCallback((user: DashboardUser) => {
    setEditingUser(user);
    userForm.setFieldsValue({
      email: user.email,
      name: user.name,
      role: user.role,
      password: "",
      allowedCampaignIds:
        user.allowedCampaignIds && user.allowedCampaignIds.length > 0
          ? user.allowedCampaignIds
          : allCampaignIds,
      forcePasswordReset: user.mustResetPassword ?? false,
    });
    setUserModalVisible(true);
  }, [userForm, allCampaignIds]);

  const handleSubmitUser = async () => {
    try {
      const values = await userForm.validateFields();
      setUserModalSubmitting(true);
      const allowedCampaignIds =
        values.allowedCampaignIds && values.allowedCampaignIds.length > 0
          ? values.allowedCampaignIds
          : allCampaignIds;
      const normalizedAllowed = Array.from(new Set(allowedCampaignIds));
      if (editingUser) {
        const payload = {
          name: values.name,
          role: values.role,
          ...(values.password ? { password: values.password } : {}),
          allowedCampaignIds: normalizedAllowed,
          forcePasswordReset: values.forcePasswordReset,
        };
        const updatedUser = await updateUser(editingUser.id, payload);
        setUsers((prev) =>
          prev.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
        );
        if (editingUser.id === currentUser.id) {
          onUserUpdate(updatedUser);
        }
        message.success("Usuario actualizado correctamente.");
      } else {
        const createdUser = await createUser({
          email: values.email,
          name: values.name,
          role: values.role,
          password: values.password!,
          allowedCampaignIds: normalizedAllowed,
          forcePasswordReset:
            values.forcePasswordReset === undefined
              ? true
              : values.forcePasswordReset,
        });
        setUsers((prev) => [...prev, createdUser]);
        message.success("Usuario creado correctamente.");
      }
      setUsersError(undefined);
      setUserModalVisible(false);
      userForm.resetFields();
    } catch (err) {
      if ((err as { errorFields?: unknown })?.errorFields) {
        return;
      }
      message.error(extractApiError(err));
    } finally {
      setUserModalSubmitting(false);
    }
  };

  const handleGenerateTempPassword = () => {
    const tempPassword = generateTemporaryPassword();
    userForm.setFieldsValue({
      password: tempPassword,
      forcePasswordReset: true,
    });
    message.info("Se generó una contraseña temporal. Compártela de forma segura.");
  };

  const handleCloseProfileModal = () => {
    setProfileModalVisible(false);
    profileForm.resetFields();
  };

  const handleUserMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      onLogout();
      return;
    }
    if (key === "profile") {
      if (!profileModalVisible) {
        openProfileModal();
      }
    }
  };

  const handleSubmitProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      setProfileSubmitting(true);

      const payload: {
        name?: string;
        currentPassword?: string;
        newPassword?: string;
      } = {};

      if (values.name !== undefined) {
        payload.name = values.name?.trim();
      }

      if (values.newPassword) {
        const trimmedNewPassword = values.newPassword.trim();
        payload.newPassword = trimmedNewPassword;
        payload.currentPassword = values.currentPassword?.trim();
      }

      const updatedUser = await updateCurrentUserProfile(payload);
      onUserUpdate(updatedUser);
      setUsers((prev) =>
        prev.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      message.success("Perfil actualizado correctamente.");
      handleCloseProfileModal();
    } catch (err) {
      if ((err as { errorFields?: unknown })?.errorFields) {
        return;
      }
      message.error(extractApiError(err));
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleDeleteUser = useCallback(async (user: DashboardUser) => {
    setDeletingUserId(user.id);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      message.success("Usuario eliminado.");
      setUsersError(undefined);
    } catch (err) {
      message.error(extractApiError(err));
    } finally {
      setDeletingUserId(null);
    }
  }, [message]);

  const campaignOptions = useMemo(
    () => [
      ...campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.id,
      })),
      ...(campaigns.length > 0
        ? [
            {
              label: "Todas las campañas",
              value: "all",
            },
          ]
        : []),
    ],
    [campaigns],
  );

  const defaultCampaignId = campaigns[0]?.id;

  const sharedQueryFilters = useMemo<Omit<SummaryFilters, "mode">>(() => {
    const filters: Omit<SummaryFilters, "mode"> = {};
    if (dateRange) {
      filters.from = dateRange[0].format("YYYY-MM-DD");
      filters.to = dateRange[1].format("YYYY-MM-DD");
    }
    if (loginType) {
      filters.loginType = loginType;
    }
    if (userIdFilter) {
      filters.userId = userIdFilter;
    }
    if (userIpFilter) {
      filters.userIp = userIpFilter;
    }
    return filters;
  }, [dateRange, loginType, userIdFilter, userIpFilter]);

  const filtersAreActive = Boolean(
    (defaultCampaignId
      ? selectedCampaign && selectedCampaign !== defaultCampaignId
      : selectedCampaign) ||
      dateRange ||
      loginType ||
      userIdFilter ||
      userIpFilter,
  );

  const pageTitle = useMemo(() => {
    switch (selectedMenu) {
      case "overview":
        return "Dashboard general";
      case "redemptions":
        return "Redenciones";
      case "login-security":
        return "Logins y seguridad";
      case "user-management":
        return "Gestión de usuarios";
      default:
        return "Dashboard";
    }
  }, [selectedMenu]);

  const selectedCampaignLabel = useMemo(() => {
    if (!selectedCampaign) {
      return "";
    }
    if (selectedCampaign === "all") {
      return "Todas las campañas";
    }
    return campaignNameMap.get(selectedCampaign) ?? selectedCampaign;
  }, [campaignNameMap, selectedCampaign]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRange) {
      return "Todo el periodo";
    }
    return `${dateRange[0].format("DD/MM/YYYY")} – ${dateRange[1].format(
      "DD/MM/YYYY",
    )}`;
  }, [dateRange]);

  const allowedCampaignIdsKey = useMemo(
    () => currentUser.allowedCampaignIds?.join("|") || "",
    [currentUser.allowedCampaignIds]
  );

  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        setLoadingCampaigns(true);
        const data = await fetchCampaigns();
        setCampaigns(data);
        if (data.length > 0) {
          setSelectedCampaign((current) => {
            if (!current) {
              return data[0].id;
            }
            if (current === "all") {
              return current;
            }
            return data.some((campaign) => campaign.id === current)
              ? current
              : data[0].id;
          });
        } else {
          setSelectedCampaign(undefined);
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar el listado de campañas.");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    loadCampaigns();
  }, [allowedCampaignIdsKey]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      if (selectedMenu === "user-management") {
        if (!cancelled) {
          setLoadingSummary(false);
        }
        return;
      }

      if (!selectedCampaign || selectedCampaign === "all") {
        if (!cancelled) {
          setSummary(null);
          setLoadingSummary(false);
          setError(undefined);
        }
        return;
      }

      try {
        setError(undefined);
        setLoadingSummary(true);

        const summaryFilters: SummaryFilters = {
          ...sharedQueryFilters,
          mode: "kpis",
        };

        const data = await fetchCampaignSummary(
          selectedCampaign,
          summaryFilters,
        );
        if (cancelled) {
          return;
        }
        setSummary(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            "No se pudo cargar la información de la campaña seleccionada.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSummary(false);
        }
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [selectedCampaign, selectedMenu, sharedQueryFilters]);

  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      if (selectedMenu !== "overview") {
        if (!cancelled) {
          setLoadingActivity(false);
        }
        return;
      }

      if (!selectedCampaign) {
        if (!cancelled) {
          setActivity(null);
          setLoadingActivity(false);
        }
        return;
      }

      try {
        setActivityError(undefined);
        setLoadingActivity(true);

        const filters: Record<string, string> = {
          includeFilters: "0",
          ...sharedQueryFilters,
        };

        const data = await fetchCampaignActivity(selectedCampaign, filters);
        if (cancelled) {
          return;
        }
        setActivity(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setActivity(null);
          setActivityError(
            "No se pudo obtener la actividad temporal para la campaña seleccionada.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingActivity(false);
        }
      }
    };

    loadActivity();
    return () => {
      cancelled = true;
    };
  }, [
    selectedCampaign,
    selectedMenu,
    sharedQueryFilters,
  ]);

  useEffect(() => {
    if (!selectedCampaign || selectedCampaign === "all") {
      return;
    }
    if (selectedMenu === "user-management") {
      return;
    }

    // Prefetch other tabs to make navigation feel instant.
    const timer = window.setTimeout(() => {
      if (selectedMenu !== "overview") {
        void fetchCampaignActivity(selectedCampaign, {
          includeFilters: "0",
          ...sharedQueryFilters,
        }).catch(() => undefined);
      }
      if (selectedMenu !== "redemptions") {
        void fetchCampaignRedemptionInsights(selectedCampaign, sharedQueryFilters).catch(
          () => undefined,
        );
      }
      if (selectedMenu !== "login-security") {
        void fetchCampaignLoginSecurity(selectedCampaign, sharedQueryFilters).catch(
          () => undefined,
        );
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedCampaign, selectedMenu, sharedQueryFilters]);

  useEffect(() => {
    let cancelled = false;

    const loadRedemptionInsights = async () => {
      if (selectedMenu !== "redemptions") {
        if (!cancelled) {
          setLoadingRedemptionInsights(false);
        }
        return;
      }

      if (!selectedCampaign || selectedCampaign === "all") {
        if (!cancelled) {
          setRedemptionInsights(null);
          setRedemptionError(undefined);
          setLoadingRedemptionInsights(false);
        }
        return;
      }

      try {
        setRedemptionError(undefined);
        setLoadingRedemptionInsights(true);

        const data = await fetchCampaignRedemptionInsights(
          selectedCampaign,
          sharedQueryFilters,
        );
        if (cancelled) {
          return;
        }
        setRedemptionInsights(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setRedemptionInsights(null);
          setRedemptionError(
            "No se pudieron obtener los insights de redenciones.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRedemptionInsights(false);
        }
      }
    };

    loadRedemptionInsights();

    return () => {
      cancelled = true;
    };
  }, [
    selectedMenu,
    selectedCampaign,
    sharedQueryFilters,
  ]);

  useEffect(() => {
    if (selectedMenu === "user-management" && currentUser.role === "admin") {
      loadUsersList();
    }
  }, [selectedMenu, currentUser.role, loadUsersList]);

  useEffect(() => {
    let cancelled = false;

    const loadLoginSecurity = async () => {
      if (selectedMenu !== "login-security") {
        if (!cancelled) {
          setLoadingLoginSecurity(false);
        }
        return;
      }

      if (!selectedCampaign || selectedCampaign === "all") {
        if (!cancelled) {
          setLoginSecurity(null);
          setLoadingLoginSecurity(false);
          setLoginSecurityError(undefined);
        }
        return;
      }

      try {
        setLoginSecurityError(undefined);
        setLoadingLoginSecurity(true);

        const data = await fetchCampaignLoginSecurity(selectedCampaign, sharedQueryFilters);
        if (cancelled) {
          return;
        }
        setLoginSecurity(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoginSecurity(null);
          setLoginSecurityError(
            "No se pudo obtener la información de logins y seguridad.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingLoginSecurity(false);
        }
      }
    };

    loadLoginSecurity();
    return () => {
      cancelled = true;
    };
  }, [
    selectedMenu,
    selectedCampaign,
    sharedQueryFilters,
  ]);

  const metricsByKey = useMemo(
    () => buildMetricsByKey(summary),
    [summary],
  );

  const activityDataset = useMemo(
    () => buildActivityDataset(activity),
    [activity],
  );

  const activityWithCumulative = useMemo(
    () => buildActivityWithCumulative(activityDataset),
    [activityDataset],
  );

  const loginTypeLabelMap = useMemo(
    () => buildLoginTypeLabelMap(activity, LOGIN_TYPE_OPTIONS),
    [activity],
  );

  const loginTypeSelectOptions = useMemo(
    () =>
      Array.from(loginTypeLabelMap.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    [loginTypeLabelMap],
  );

  const activeFilterTags = useMemo(() => {
    const tags: { key: string; label: string; onClose: () => void }[] = [];

    if (dateRange) {
      tags.push({
        key: "dateRange",
        label: `Fechas: ${dateRangeLabel}`,
        onClose: () => setDateRange(null),
      });
    }

    if (loginType) {
      const label = loginTypeLabelMap.get(loginType) ?? loginType;
      tags.push({
        key: "loginType",
        label: `Login: ${label}`,
        onClose: () => setLoginType(undefined),
      });
    }

    if (userIdFilter) {
      tags.push({
        key: "userId",
        label: `Usuario: ${userIdFilter}`,
        onClose: () => {
          setUserIdFilter(undefined);
          setUserIdInput("");
        },
      });
    }

    if (userIpFilter) {
      tags.push({
        key: "userIp",
        label: `IP: ${userIpFilter}`,
        onClose: () => {
          setUserIpFilter(undefined);
          setUserIpInput("");
        },
      });
    }

    return tags;
  }, [
    dateRange,
    dateRangeLabel,
    loginType,
    loginTypeLabelMap,
    userIdFilter,
    userIpFilter,
  ]);

  const loginTypeDistribution = useMemo(
    () => buildLoginTypeDistribution(activity, loginTypeLabelMap),
    [activity, loginTypeLabelMap],
  );

  const loginHeatmapData = useMemo(
    () => buildLoginHeatmapData(activity),
    [activity],
  );

  const axisExtents = useMemo(
    () => calculateActivityAxisExtents(activityDataset),
    [activityDataset],
  );

  const loginSecurityTopLoginData = useMemo(
    () => buildLoginSecurityTopIps(loginSecurity?.topLoginIps),
    [loginSecurity],
  );

  const loginSecurityTopRedemptionData = useMemo(
    () => buildLoginSecurityTopIps(loginSecurity?.topRedemptionIps),
    [loginSecurity],
  );

  const loginSecurityDetailRows = useMemo(
    () => buildLoginSecurityDetailRows(loginSecurity),
    [loginSecurity],
  );

  const applyIpFilter = useCallback((ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed) {
      return;
    }
    setUserIpInput(trimmed);
    setUserIpFilter(trimmed);
  }, []);

  const applyUserIdFilter = useCallback((idmask: string) => {
    const trimmed = idmask.trim();
    if (!trimmed) {
      return;
    }
    setUserIdInput(trimmed);
    setUserIdFilter(trimmed);
  }, []);

  const clearIpFilter = useCallback(() => {
    setUserIpInput("");
    setUserIpFilter(undefined);
  }, []);

  const loginSecurityAtypicalRows = useMemo(
    () => buildLoginSecurityAtypicalRows(loginSecurity),
    [loginSecurity],
  );

  const loginSecurityDetailColumns = useMemo(
    () =>
      createLoginSecurityDetailColumns({
        onSelectIp: applyIpFilter,
        onSelectUserId: applyUserIdFilter,
      }),
    [applyIpFilter, applyUserIdFilter],
  );

  const loginSecurityAtypicalColumns = useMemo(
    () =>
      createLoginSecurityAtypicalColumns({
        onSelectIp: applyIpFilter,
      }),
    [applyIpFilter],
  );

  const loginSecurityIpSpotlight = useMemo(() => {
    if (!loginSecurity || !userIpFilter) {
      return null;
    }

    const ip = userIpFilter.trim();
    if (!ip) {
      return null;
    }

    const loginInfo =
      loginSecurity.topLoginIps?.find((entry) => entry.ip === ip) ??
      loginSecurity.topLoginIps?.[0] ??
      null;
    const redemptionInfo =
      loginSecurity.topRedemptionIps?.find((entry) => entry.ip === ip) ??
      loginSecurity.topRedemptionIps?.[0] ??
      null;

    const redemptionAttempts =
      typeof redemptionInfo?.redemptionAttempts === "number"
        ? redemptionInfo.redemptionAttempts
        : 0;

    const dominant = loginSecurityDetailRows.reduce(
      (acc, row) => {
        if (row.ip !== ip) {
          return acc;
        }
        const attempts =
          typeof row.redemptionAttempts === "number" ? row.redemptionAttempts : 0;
        if (attempts <= (acc.attempts ?? 0)) {
          return acc;
        }
        return {
          idmask: row.idmask ?? null,
          attempts,
          valid:
            typeof row.validRedemptions === "number" ? row.validRedemptions : 0,
        };
      },
      { idmask: null as string | null, attempts: 0, valid: 0 },
    );

    const dominantShare =
      redemptionAttempts > 0 ? dominant.attempts / redemptionAttempts : null;

    return {
      ip,
      totalLogins:
        typeof loginInfo?.totalLogins === "number" ? loginInfo.totalLogins : 0,
      uniqueLoginUsers:
        typeof loginInfo?.uniqueUsers === "number" ? loginInfo.uniqueUsers : 0,
      redemptionAttempts,
      uniqueAttemptRedeemers:
        typeof redemptionInfo?.uniqueAttemptRedeemers === "number"
          ? redemptionInfo.uniqueAttemptRedeemers
          : 0,
      validRedemptions:
        typeof redemptionInfo?.validRedemptions === "number"
          ? redemptionInfo.validRedemptions
          : 0,
      uniqueRedeemers:
        typeof redemptionInfo?.uniqueRedeemers === "number"
          ? redemptionInfo.uniqueRedeemers
          : 0,
      redeemedValue:
        typeof redemptionInfo?.redeemedValue === "number"
          ? redemptionInfo.redeemedValue
          : 0,
      firstActivityAt:
        redemptionInfo?.firstRedemptionAt ??
        loginInfo?.firstLoginAt ??
        null,
      lastActivityAt:
        redemptionInfo?.lastRedemptionAt ??
        loginInfo?.lastLoginAt ??
        null,
      dominantIdmask: dominant.idmask,
      dominantAttempts: dominant.attempts,
      dominantValid: dominant.valid,
      dominantShare,
    };
  }, [loginSecurity, loginSecurityDetailRows, userIpFilter]);

  const userColumns = useMemo(
    () =>
      createUserColumns({
        currentUserId: currentUser.id,
        deletingUserId,
        totalCampaignCount,
        campaignNameMap,
        onEdit: handleOpenEditUser,
        onDelete: handleDeleteUser,
      }),
    [
      currentUser.id,
      deletingUserId,
      totalCampaignCount,
      campaignNameMap,
      handleOpenEditUser,
      handleDeleteUser,
    ],
  );

  const userTableData = useMemo(
    () => buildUserTableData(users),
    [users],
  );

  const isEditingUser = Boolean(editingUser);
  const userModalTitle = isEditingUser ? "Editar usuario" : "Nuevo usuario";

  const redemptionAmountChartData = useMemo(
    () => buildRedemptionAmountChartData(redemptionInsights),
    [redemptionInsights],
  );

  const merchantPieData = useMemo(
    () => buildMerchantPieData(redemptionInsights),
    [redemptionInsights],
  );

  const redemptionHeatmapData = useMemo(
    () => buildRedemptionHeatmapData(redemptionInsights),
    [redemptionInsights],
  );

  const redemptionTableData = useMemo(
    () => buildRedemptionTableData(redemptionInsights),
    [redemptionInsights],
  );

  const redemptionTableColumns = useMemo(
    () => createRedemptionTableColumns(),
    [],
  );

  const handleExportCurrentView = async () => {
    try {
      setExportingExcel(true);

      const timestamp = dayjs().format("YYYYMMDD-HHmm");
      const campaignSlug = selectedCampaign ? selectedCampaign : "sin-campana";
      const fileName = `dashboard-${selectedMenu}-${campaignSlug}-${timestamp}.xlsx`;

      const filtersSheet = [
        {
          vista: selectedMenu,
          campaignId: selectedCampaign ?? null,
          from: dateRange ? dateRange[0].format("YYYY-MM-DD") : null,
          to: dateRange ? dateRange[1].format("YYYY-MM-DD") : null,
          loginType: loginType ?? null,
          userId: userIdFilter ?? null,
          userIp: userIpFilter ?? null,
        },
      ];

      const sheets: { name: string; data: Record<string, unknown>[] }[] = [
        { name: "Filtros", data: filtersSheet },
      ];

      if (summary?.metrics?.length) {
        sheets.push({
          name: "KPIs",
          data: summary.metrics.map((metric) => ({
            key: metric.key,
            label: metric.label,
            value: metric.value,
          })),
        });
      }

      if (selectedMenu === "overview") {
        if (activity?.points?.length) {
          sheets.push({
            name: "Actividad",
            data: activity.points as unknown as Record<string, unknown>[],
          });
        }
        if (activity?.totals) {
          sheets.push({
            name: "Actividad Totales",
            data: [activity.totals as unknown as Record<string, unknown>],
          });
        }
        if (activity?.loginTypeBreakdown?.length) {
          sheets.push({
            name: "Login Types",
            data: activity.loginTypeBreakdown as unknown as Record<string, unknown>[],
          });
        }
        if (activity?.loginHeatmap?.length) {
          sheets.push({
            name: "Login Heatmap",
            data: activity.loginHeatmap as unknown as Record<string, unknown>[],
          });
        }
        if (activity?.annotations?.length) {
          sheets.push({
            name: "Hitos",
            data: activity.annotations as unknown as Record<string, unknown>[],
          });
        }
      } else if (selectedMenu === "redemptions") {
        if (redemptionInsights?.amountDistribution?.length) {
          sheets.push({
            name: "Montos",
            data: redemptionInsights.amountDistribution as unknown as Record<
              string,
              unknown
            >[],
          });
        }
        if (redemptionInsights?.merchantPie?.length) {
          sheets.push({
            name: "Pie Premios",
            data: redemptionInsights.merchantPie as unknown as Record<string, unknown>[],
          });
        }
        if (redemptionInsights?.merchantTotals?.length) {
          sheets.push({
            name: "Premios Totales",
            data: redemptionInsights.merchantTotals as unknown as Record<
              string,
              unknown
            >[],
          });
        }
        if (redemptionInsights?.heatmap?.cells?.length) {
          sheets.push({
            name: "Heatmap",
            data: redemptionInsights.heatmap.cells as unknown as Record<string, unknown>[],
          });
        }
      } else if (selectedMenu === "login-security") {
        if (loginSecurity?.topLoginIps?.length) {
          sheets.push({
            name: "Top Login IPs",
            data: loginSecurity.topLoginIps as unknown as Record<string, unknown>[],
          });
        }
        if (loginSecurity?.topRedemptionIps?.length) {
          sheets.push({
            name: "Top Red IPs",
            data: loginSecurity.topRedemptionIps as unknown as Record<
              string,
              unknown
            >[],
          });
        }
        if (loginSecurity?.loginIpDetails?.length) {
          sheets.push({
            name: "Detalle IP",
            data: loginSecurity.loginIpDetails as unknown as Record<
              string,
              unknown
            >[],
          });
        }
        if (loginSecurity?.atypicalIps?.length) {
          sheets.push({
            name: "IPs Atipicas",
            data: loginSecurity.atypicalIps as unknown as Record<string, unknown>[],
          });
        }
        if (loginSecurity?.twoFactorAdoption?.entries?.length) {
          sheets.push({
            name: "2FA",
            data: loginSecurity.twoFactorAdoption.entries as unknown as Record<
              string,
              unknown
            >[],
          });
        }
        if (loginSecurity?.metadata) {
          sheets.push({
            name: "Metadata",
            data: [loginSecurity.metadata as unknown as Record<string, unknown>],
          });
        }
      } else if (selectedMenu === "user-management") {
        if (users.length > 0) {
          sheets.push({
            name: "Usuarios",
            data: users.map((user) => ({
              ...user,
              allowedCampaignIds: (user.allowedCampaignIds ?? []).join(", "),
            })) as unknown as Record<string, unknown>[],
          });
        }
      }

      if (sheets.length <= 1) {
        message.warning("No hay datos cargados para exportar.");
        return;
      }

      await exportExcel({ fileName, sheets });
    } catch (err) {
      console.error(err);
      message.error("No se pudo exportar el Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  const handleUserIdSearch = (value: string) => {
    const trimmed = value.trim();
    setUserIdInput(trimmed);
    setUserIdFilter(trimmed || undefined);
  };

  const handleUserIpSearch = (value: string) => {
    const trimmed = value.trim();
    setUserIpInput(trimmed);
    setUserIpFilter(trimmed || undefined);
  };

  const handleResetFilters = () => {
    setSelectedCampaign(defaultCampaignId);
    setDateRange(null);
    setLoginType(undefined);
    setUserIdFilter(undefined);
    setUserIpFilter(undefined);
    setUserIdInput("");
    setUserIpInput("");
  };

  const handleDateRangeChange: RangePickerProps["onChange"] = (values) => {
    if (!values || values.length !== 2) {
      setDateRange(null);
      return;
    }

    const [start, end] = values;
    if (!start || !end) {
      setDateRange(null);
      return;
    }

    setDateRange([start, end]);
  };

  const mainSection = (() => {
    switch (selectedMenu) {
      case "overview":
        return (
          <>
            <ActivitySection
              loadingActivity={loadingActivity}
              error={activityError}
              activityDataset={activityDataset}
              activityCumulativeDataset={activityWithCumulative}
              axisExtents={axisExtents}
              loginTypeDistribution={loginTypeDistribution}
              loginHeatmapData={loginHeatmapData}
              annotations={activity?.annotations}
            />
          </>
        );
      case "redemptions":
        return (
          <RedemptionsSection
            selectedCampaign={selectedCampaign}
            redemptionError={redemptionError}
            loading={loadingRedemptionInsights}
            redemptionInsights={redemptionInsights}
            amountChartData={redemptionAmountChartData}
            merchantPieData={merchantPieData}
            heatmapData={redemptionHeatmapData}
            tableColumns={redemptionTableColumns}
            tableData={redemptionTableData}
          />
        );
      case "login-security":
        return (
          <LoginSecuritySection
            selectedCampaign={selectedCampaign}
            loginSecurityError={loginSecurityError}
            loading={loadingLoginSecurity}
            loginSecurity={loginSecurity}
            topLoginData={loginSecurityTopLoginData}
            topRedemptionData={loginSecurityTopRedemptionData}
            detailColumns={loginSecurityDetailColumns}
            detailRows={loginSecurityDetailRows}
            atypicalColumns={loginSecurityAtypicalColumns}
            atypicalRows={loginSecurityAtypicalRows}
            activeIpFilter={userIpFilter}
            onSelectIp={applyIpFilter}
            onClearIpFilter={clearIpFilter}
            ipSpotlight={loginSecurityIpSpotlight}
          />
        );
      case "user-management":
        return (
          <UserManagementSection
            usersError={usersError}
            onCreateUser={handleOpenCreateUser}
            loading={loadingUsers}
            columns={userColumns}
            dataSource={userTableData}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <Layout className="dashboard-layout">
      {isDesktop ? (
        <Sider
          className={`dashboard-sider ${
            collapsed ? "dashboard-sider--collapsed" : ""
          }`}
          width={220}
          collapsedWidth={80}
          theme="light"
          collapsible
          collapsed={collapsed}
          trigger={null}
        >
          <div className="dashboard-sider__content">
            <div className="dashboard-sider__brand">
              <img
                src="https://logos-world.net/wp-content/uploads/2020/09/Mastercard-Logo.png"
                alt="Mastercard"
              />
            </div>
            <div className="dashboard-sider__menu">
              <Menu
                mode="inline"
                items={menuItems}
                selectedKeys={[selectedMenu]}
                inlineCollapsed={collapsed}
                onClick={({ key }) => setSelectedMenu(key as MenuKey)}
              />
            </div>
          </div>
        </Sider>
      ) : (
        <Drawer
          className="dashboard-mobileNav"
          placement="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          width={300}
          title={null}
          closeIcon={null}
          styles={{
            header: { display: "none" },
            body: { padding: 0 },
          }}
        >
          <div className="dashboard-sider__content dashboard-sider__content--mobile">
            <div className="dashboard-sider__brand dashboard-sider__brand--mobile">
              <img
                src="https://logos-world.net/wp-content/uploads/2020/09/Mastercard-Logo.png"
                alt="Mastercard"
              />
            </div>
            <div className="dashboard-sider__menu">
              <Menu
                mode="inline"
                items={menuItems}
                selectedKeys={[selectedMenu]}
                onClick={({ key }) => {
                  setSelectedMenu(key as MenuKey);
                  setMobileNavOpen(false);
                }}
              />
            </div>
          </div>
        </Drawer>
      )}
      <Layout>
        <Header className="dashboard-header">
          <div className="dashboard-header__left">
            <Button
              type="text"
              className="dashboard-header__navTrigger"
              icon={
                isDesktop ? (
                  collapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                ) : (
                  <MenuOutlined />
                )
              }
              onClick={() => {
                if (isDesktop) {
                  setCollapsed((prev) => !prev);
                  return;
                }
                setMobileNavOpen(true);
              }}
              aria-label={
                isDesktop
                  ? collapsed
                    ? "Expandir menú"
                    : "Colapsar menú"
                  : "Abrir menú"
              }
            />
            <div className="dashboard-header__titles">
              <Title level={3} className="dashboard-header__title">
                {pageTitle}
              </Title>
              {selectedMenu !== "user-management" && selectedCampaignLabel && (
                <Text className="dashboard-header__subtitle">
                  {selectedCampaignLabel} · {dateRangeLabel}
                </Text>
              )}
            </div>
          </div>

          <Space
            align="center"
            size="middle"
            className="dashboard-header__actions"
          >
            <Button
              className="dashboard-header__export"
              icon={<DownloadOutlined />}
              onClick={handleExportCurrentView}
              loading={exportingExcel}
            >
              <span className="dashboard-header__exportLabel">
                Exportar Excel
              </span>
            </Button>
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Space
                align="center"
                size="small"
                className="dashboard-header__user"
                onClick={(event) => event.preventDefault()}
              >
                <Avatar
                  size={36}
                  style={{
                    backgroundColor: "#f79e1b",
                    color: "#111111",
                    fontWeight: 700,
                  }}
                >
                  {userInitial}
                </Avatar>
                <div className="dashboard-header__user-meta">
                  <Text className="dashboard-header__user-name">
                    {userDisplayName}
                  </Text>
                  <Text className="dashboard-header__user-role">
                    {ROLE_LABELS[currentUser.role]}
                  </Text>
                  {mustChangePassword && (
                    <Text type="danger" style={{ fontSize: 11 }}>
                      Cambio de clave pendiente
                    </Text>
                  )}
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content className="dashboard-content">
          {selectedMenu !== "user-management" && (
            <div className="dashboard-filterBar">
              <div className="dashboard-container">
                <Card className="filter-bar-card">
                  <div className="filter-bar__top">
                    <div className="filter-bar__title">
                      <Text strong>Filtros</Text>
                      <Text type="secondary" className="filter-bar__count">
                        {activeFilterTags.length > 0
                          ? `${activeFilterTags.length} activos`
                          : "Sin filtros"}
                      </Text>
                    </div>
                    <Button
                      onClick={handleResetFilters}
                      disabled={!filtersAreActive}
                    >
                      Borrar
                    </Button>
                  </div>

                  <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} md={12} lg={10}>
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary" className="filter-label">
                          Campaña
                        </Text>
                        <Select
                          style={{ width: "100%" }}
                          loading={loadingCampaigns}
                          placeholder="Selecciona una campaña"
                          value={selectedCampaign ?? undefined}
                          onChange={(value) => {
                            if (typeof value === "string") {
                              setSelectedCampaign(value);
                            }
                          }}
                          options={campaignOptions}
                          showSearch
                          optionFilterProp="label"
                        />
                      </Space>
                    </Col>
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary" className="filter-label">
                          Rango de fechas
                        </Text>
                        <DatePicker.RangePicker
                          allowEmpty={[true, true]}
                          allowClear
                          value={dateRange ?? null}
                          onChange={handleDateRangeChange}
                          style={{ width: "100%" }}
                          format="DD/MM/YYYY"
                          placeholder={["Fecha inicial", "Fecha final"]}
                        />
                      </Space>
                    </Col>
                    <Col xs={24} md={12} lg={6}>
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary" className="filter-label">
                          Tipo de login
                        </Text>
                        <Select
                          allowClear
                          placeholder="Todos"
                          style={{ width: "100%" }}
                          value={loginType ?? undefined}
                          options={loginTypeSelectOptions}
                          onChange={(value) => {
                            if (typeof value === "string") {
                              setLoginType(value);
                            } else {
                              setLoginType(undefined);
                            }
                          }}
                        />
                      </Space>
                    </Col>
                  </Row>

                  <Row gutter={[12, 12]} align="middle" style={{ marginTop: 4 }}>
                    <Col xs={24} md={12}>
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary" className="filter-label">
                          Id de usuario
                        </Text>
                        <Input.Search
                          allowClear
                          placeholder="Busca por Id de usuario"
                          value={userIdInput}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setUserIdInput(nextValue);
                            if (nextValue.trim() === "") {
                              setUserIdFilter(undefined);
                            }
                          }}
                          onSearch={handleUserIdSearch}
                        />
                      </Space>
                    </Col>
                    <Col xs={24} md={12}>
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary" className="filter-label">
                          IP
                        </Text>
                        <Input.Search
                          allowClear
                          placeholder="Busca por IP"
                          value={userIpInput}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setUserIpInput(nextValue);
                            if (nextValue.trim() === "") {
                              setUserIpFilter(undefined);
                            }
                          }}
                          onSearch={handleUserIpSearch}
                        />
                      </Space>
                    </Col>
                  </Row>

                  {activeFilterTags.length > 0 && (
                    <div className="filter-bar__chips">
                      {activeFilterTags.map((tag) => (
                        <Tag
                          key={tag.key}
                          closable
                          onClose={(event) => {
                            event.preventDefault();
                            tag.onClose();
                          }}
                        >
                          {tag.label}
                        </Tag>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          <div className="dashboard-inner">
            <div className="dashboard-container">
              <div className="dashboard-stack">
                {selectedMenu !== "user-management" &&
                  error && <Alert type="error" message={error} showIcon />}

                {selectedMenu !== "user-management" && (
                  <Spin spinning={loadingSummary}>
                    {summary ? (
                      <Card className="kpi-wrapper">
                        <div className="kpi-header">
                          <Title level={4} className="kpi-title">
                            Indicadores generales
                          </Title>
                          <div className="kpi-separator" />
                        </div>
                        <Row gutter={[16, 16]} className="kpi-grid">
                          {KPI_DEFINITIONS.map((definition, index) => {
                            const metricValue = metricsByKey.get(
                              definition.key,
                            )?.value;
                            const titleNode = (
                              <span className="kpi-card__title">
                                {definition.label}
                                {definition.help && (
                                  <Tooltip title={definition.help}>
                                    <InfoCircleOutlined className="kpi-help" />
                                  </Tooltip>
                                )}
                              </span>
                            );

                            return (
                              <Col
                                key={definition.key}
                                xs={24}
                                sm={12}
                                lg={8}
                                xl={6}
                                className="kpi-col"
                              >
                                <Card
                                  className={`kpi-card kpi-card--accent-${
                                    index % 3
                                  }`}
                                >
                                  <Statistic
                                    title={titleNode}
                                    value={metricValue ?? 0}
                                    formatter={() =>
                                      formatValue(metricValue, definition.format)
                                    }
                                  />
                                </Card>
                              </Col>
                            );
                          })}
                        </Row>
                      </Card>
                    ) : (
                      !loadingSummary && (
                        <Card className="empty-card">
                          <Empty description="Selecciona una campaña para visualizar los KPIs." />
                        </Card>
                      )
                    )}
                  </Spin>
                )}

                {mainSection}
              </div>
            </div>
          </div>

          <Modal
              title="Mi perfil"
              open={profileModalVisible}
              onCancel={mustChangePassword ? undefined : handleCloseProfileModal}
              onOk={handleSubmitProfile}
              confirmLoading={profileSubmitting}
              destroyOnHidden
              maskClosable={!mustChangePassword}
              closable={!mustChangePassword}
              keyboard={!mustChangePassword}
              okText="Guardar cambios"
              cancelText="Cancelar"
              cancelButtonProps={
                mustChangePassword ? { style: { display: "none" } } : undefined
              }
            >
              {mustChangePassword && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Debes actualizar tu contraseña para continuar usando el dashboard."
                />
              )}
              <Form<ProfileFormValues>
                layout="vertical"
                form={profileForm}
                preserve={false}
              >
                <Form.Item label="Correo electrónico">
                  <Input value={currentUser.email} disabled />
                </Form.Item>
                <Form.Item
                  label="Nombre completo"
                  name="name"
                  rules={[{ max: 100, message: "Máximo 100 caracteres" }]}
                >
                  <Input placeholder="Nombre visible en el dashboard" />
                </Form.Item>
                <Form.Item
                  label="Contraseña actual"
                  name="currentPassword"
                  rules={[
                    {
                      validator: (_rule, value: string | undefined) => {
                        const newPassword = profileForm.getFieldValue("newPassword");
                        if (mustChangePassword || newPassword) {
                          if (!value || value.length === 0) {
                            return Promise.reject(
                              new Error("Ingresa tu contraseña actual"),
                            );
                          }
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input.Password
                    autoComplete="current-password"
                    placeholder="Contraseña actual"
                  />
                </Form.Item>
                <Form.Item
                  label="Nueva contraseña"
                  name="newPassword"
                  rules={[
                    {
                      validator: (_rule, value: string | undefined) => {
                        if (!value || value.length === 0) {
                          if (mustChangePassword) {
                            return Promise.reject(
                              new Error(
                                "Debes definir una nueva contraseña",
                              ),
                            );
                          }
                          return Promise.resolve();
                        }
                        if (value.length < MIN_PASSWORD_LENGTH) {
                          return Promise.reject(
                            new Error(
                              `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
                            ),
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                  extra={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
                >
                  <Input.Password
                    autoComplete="new-password"
                    placeholder="Nueva contraseña"
                  />
                </Form.Item>
                <Form.Item
                  label="Confirmar nueva contraseña"
                  name="confirmPassword"
                  dependencies={["newPassword"]}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator: (_rule, value: string | undefined) => {
                        const newPassword = getFieldValue("newPassword");
                        if (!newPassword) {
                          if (value && value.length > 0) {
                            return Promise.reject(
                              new Error("Primero ingresa la nueva contraseña"),
                            );
                          }
                          return Promise.resolve();
                        }
                        if (!value || value.length === 0) {
                          return Promise.reject(
                            new Error("Confirma la nueva contraseña"),
                          );
                        }
                        if (value !== newPassword) {
                          return Promise.reject(
                            new Error("Las contraseñas no coinciden"),
                          );
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    autoComplete="new-password"
                    placeholder="Repite la nueva contraseña"
                  />
                </Form.Item>
                </Form>
          </Modal>

          {currentUser.role === "admin" && (
            <Modal
              title={userModalTitle}
              open={userModalVisible}
              onCancel={() => {
                setUserModalVisible(false);
                userForm.resetFields();
              }}
              onOk={handleSubmitUser}
              confirmLoading={userModalSubmitting}
              destroyOnHidden
              maskClosable={false}
              okText={isEditingUser ? "Guardar cambios" : "Crear usuario"}
              cancelText="Cancelar"
            >
              <Form<UserFormValues> layout="vertical" form={userForm} preserve={false}>
                <Form.Item
                  label="Correo electrónico"
                  name="email"
                  rules={[
                    { required: true, message: "El correo es obligatorio" },
                    { type: "email", message: "Ingresa un correo válido" },
                  ]}
                >
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@empresa.com"
                    disabled={isEditingUser}
                  />
                </Form.Item>
                <Form.Item
                  label="Nombre completo"
                  name="name"
                  rules={[{ max: 100, message: "Máximo 100 caracteres" }]}
                >
                  <Input
                    autoComplete="name"
                    placeholder="Nombre visible en el dashboard"
                  />
                </Form.Item>
                <Form.Item
                  label="Rol"
                  name="role"
                  rules={[{ required: true, message: "Selecciona un rol" }]}
                >
                  <Select
                    options={[
                      { label: "Administrador", value: "admin" },
                      { label: "Analista", value: "viewer" },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  label="Campañas habilitadas"
                  name="allowedCampaignIds"
                  rules={[
                    {
                      validator: (_rule, value?: string[]) => {
                        if (totalCampaignCount === 0) {
                          return Promise.resolve();
                        }
                        if (!value || value.length === 0) {
                          return Promise.reject(
                            new Error("Selecciona al menos una campaña"),
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Select
                    mode="multiple"
                    placeholder="Selecciona las campañas"
                    options={userCampaignOptions}
                    optionFilterProp="label"
                    loading={loadingCampaigns}
                    disabled={loadingCampaigns}
                    maxTagCount="responsive"
                  />
                </Form.Item>
                <Form.Item
                  label="Contraseña"
                  name="password"
                  rules={[
                    {
                      validator: (_rule, value: string | undefined) => {
                        if (!value || value.length === 0) {
                          return isEditingUser
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error("Ingresa una contraseña segura"),
                              );
                        }
                        if (value.length < MIN_PASSWORD_LENGTH) {
                          return Promise.reject(
                            new Error(
                              `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
                            ),
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                  extra={
                    <Space size="small" wrap>
                      <span>
                        {isEditingUser
                          ? "Deja este campo vacío para mantener la contraseña actual."
                          : `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
                      </span>
                      <Button
                        type="link"
                        onClick={handleGenerateTempPassword}
                        style={{ padding: 0 }}
                      >
                        Generar contraseña temporal
                      </Button>
                    </Space>
                  }
                >
                  <Input.Password
                    autoComplete="new-password"
                    placeholder={
                      isEditingUser
                        ? "Deja vacío para no cambiarla"
                        : "Introduce una contraseña"
                    }
                  />
                </Form.Item>
                <Form.Item
                  label="Requerir cambio de contraseña al iniciar"
                  name="forcePasswordReset"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Sí" unCheckedChildren="No" />
                </Form.Item>
                <Form.Item shouldUpdate noStyle>
                  {() => {
                    const requireReset = userForm.getFieldValue("forcePasswordReset");
                    return requireReset ? (
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="La próxima vez que el usuario inicie sesión deberá definir una nueva contraseña."
                      />
                    ) : null;
                  }}
                </Form.Item>
              </Form>
            </Modal>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard;
