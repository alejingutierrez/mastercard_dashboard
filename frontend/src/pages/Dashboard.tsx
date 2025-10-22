import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { MenuProps } from "antd";
import type { RangePickerProps } from "antd/es/date-picker";
import dayjs from "dayjs";
import {
  AppstoreOutlined,
  DeleteOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  PieChartOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
  EditOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import {
  LineChart as ReLineChart,
  Line,
  BarChart as ReBarChart,
  Bar,
  ComposedChart as ReComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer,
  ReferenceLine,
  PieChart as RePieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  ActivityResponse,
  Campaign,
  CampaignSummaryResponse,
  ConversionFunnelResponse,
  LoginSecurityAtypicalIp,
  LoginSecurityDetailRow,
  LoginSecurityResponse,
  RedemptionInsightsResponse,
  Metric,
  DashboardUser,
  TwoFactorTotals,
} from "../types";
import {
  fetchCampaigns,
  fetchCampaignSummary,
  fetchCampaignActivity,
  fetchCampaignRedemptionInsights,
  fetchCampaignLoginSecurity,
  fetchCampaignConversionFunnel,
} from "../api/campaigns";
import { updateCurrentUserProfile } from "../api/auth";
import { fetchUsers, createUser, updateUser, deleteUser } from "../api/users";
import type { ColumnsType } from "antd/es/table";

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

const ROLE_LABELS: Record<DashboardUser["role"], string> = {
  admin: "Administrador",
  viewer: "Analista",
};

const MIN_PASSWORD_LENGTH = 8;

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

const SEVERITY_LABELS: Record<LoginSecurityAtypicalIp["severity"], string> = {
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

const SEVERITY_COLORS: Record<LoginSecurityAtypicalIp["severity"], string> = {
  high: "red",
  medium: "orange",
  low: "gold",
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
}

interface SegmentRedemptionBreakdownEntry {
  segment: string;
  uniqueRedeemers: number;
  totalRedemptions: number;
  redeemedValue: number;
  averageTicket: number | null;
}

interface RedemptionTableRow {
  key: string;
  merchant: string;
  redemptions: number;
  totalValue: number;
  averageValue: number;
  uniqueUsers: number;
}

interface ConversionFunnelChartDatum {
  key: string;
  weekStart: string;
  weekEnd: string | null;
  weekLabel: string;
  weekRangeVerbose: string;
  loginUsers: number;
  awardRequests: number;
  redemptionUsers: number;
  loginOnlyUsers: number;
  awardOnlyUsers: number;
  redemptionUsersSegment: number;
  conversionRate: number | null;
  requestRate: number | null;
  approvalRate: number | null;
  loginEvents: number;
  awardEvents: number;
  redemptionEvents: number;
}

interface TwoFactorHeatmapWeek {
  value: string;
  label: string;
  tooltip: string;
}

interface TwoFactorHeatmapSegment {
  value: string;
  label: string;
}

interface TwoFactorHeatmapMetrics {
  rate: number;
  usersWithTwoFactor: number;
  totalUsers: number;
}

interface TwoFactorHeatmapData {
  weeks: TwoFactorHeatmapWeek[];
  segments: TwoFactorHeatmapSegment[];
  valueMap: Map<string, TwoFactorHeatmapMetrics>;
  maxRate: number;
  minRate: number;
  targetRate: number | null;
  totals: TwoFactorTotals;
}

const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: "totalUsers", label: "Usuarios totales" },
  { key: "totalLogins", label: "Logins totales" },
  { key: "usersWithLogin", label: "Usuarios con login" },
  { key: "totalRedemptions", label: "Redenciones totales" },
  { key: "totalWinners", label: "Ganadores totales" },
  {
    key: "totalRedeemedValue",
    label: "Valor acumulado en redenciones",
    format: "currency",
  },
];

const SEGMENT_REDEMPTION_CHART_KEY = "segmentRedemptionBreakdown";

const REDEMPTION_PIE_COLORS = [
  "#eb001b",
  "#ff6f61",
  "#ffac33",
  "#4b99ff",
  "#18a999",
  "#9c27b0",
  "#f06292",
  "#ffd54f",
  "#64b5f6",
  "#6d4c41",
  "#607d8b",
];

const EMPTY_TWO_FACTOR_TOTALS: TwoFactorTotals = Object.freeze({
  totalUsers: 0,
  usersWithTwoFactor: 0,
  overallRate: null,
});

const LOGIN_TYPE_OPTIONS = [
  { value: "0", label: "Login no exitoso (0)" },
  { value: "1", label: "Login exitoso (1)" },
  { value: "2", label: "Autologin (2)" },
];

const formatValue = (
  value: number | null | undefined,
  format: KpiFormat = "number",
) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }

  if (format === "currency") {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("es-ES").format(value);
};

const formatNumber = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return new Intl.NumberFormat("es-ES").format(value);
};

const formatPercentage = (value: number | null | undefined, digits = 1) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return `${(value * 100).toFixed(digits)}%`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "N/D";
  }
  const explicit = dayjs(value, ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD"], true);
  if (explicit.isValid()) {
    return explicit.format(
      value.length <= 10 ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm",
    );
  }
  const fallback = dayjs(value);
  if (fallback.isValid()) {
    return fallback.format("DD/MM/YYYY HH:mm");
  }
  return value;
};

const formatDays = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }
  return `${value.toFixed(1)} días`;
};

const Dashboard = ({ currentUser, onLogout, onUserUpdate }: DashboardProps) => {
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>("overview");
  const [collapsed, setCollapsed] = useState(false);
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
  const [conversionFunnel, setConversionFunnel] =
    useState<ConversionFunnelResponse | null>(null);
  const [loadingConversionFunnel, setLoadingConversionFunnel] =
    useState(false);
  const [conversionFunnelError, setConversionFunnelError] =
    useState<string>();
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
  }, []);

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

  const loginTypeSelectOptions = useMemo(() => {
    const optionMap = new Map<string, { value: string; label: string }>();
    LOGIN_TYPE_OPTIONS.forEach(({ value, label }) => {
      optionMap.set(value, { value, label });
    });

    (activity?.filters?.loginTypes ?? []).forEach(({ value, label }) => {
      if (!optionMap.has(value)) {
        optionMap.set(value, { value, label: label ?? value });
      }
    });

    return Array.from(optionMap.values());
  }, [activity]);

  const defaultCampaignId = campaigns[0]?.id;

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

        const filters: Record<string, string> = {};
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

        const summaryFilters =
          Object.keys(filters).length > 0 ? filters : undefined;

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
  }, [selectedCampaign, dateRange, loginType, userIdFilter, userIpFilter]);

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

        const filters: Record<string, string> = {};
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
    dateRange,
    loginType,
    userIdFilter,
    userIpFilter,
    selectedMenu,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadConversionFunnel = async () => {
      if (selectedMenu !== "overview") {
        if (!cancelled) {
          setLoadingConversionFunnel(false);
        }
        return;
      }

      if (!selectedCampaign) {
        if (!cancelled) {
          setConversionFunnel(null);
          setConversionFunnelError(undefined);
          setLoadingConversionFunnel(false);
        }
        return;
      }

      try {
        setConversionFunnelError(undefined);
        setLoadingConversionFunnel(true);

        const filters: Record<string, string> = {};
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

        const funnelFilters =
          Object.keys(filters).length > 0 ? filters : undefined;

        const data = await fetchCampaignConversionFunnel(
          selectedCampaign,
          funnelFilters,
        );
        if (cancelled) {
          return;
        }
        setConversionFunnel(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setConversionFunnel(null);
          setConversionFunnelError(
            "No se pudo obtener el funnel de conversión.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingConversionFunnel(false);
        }
      }
    };

    loadConversionFunnel();
    return () => {
      cancelled = true;
    };
  }, [
    selectedMenu,
    selectedCampaign,
    dateRange,
    loginType,
    userIdFilter,
    userIpFilter,
  ]);

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

        const filters: Record<string, string> = {};
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

        const data = await fetchCampaignRedemptionInsights(
          selectedCampaign,
          filters,
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
    dateRange,
    loginType,
    userIdFilter,
    userIpFilter,
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

        const filters: Record<string, string> = {};
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

        const params = Object.keys(filters).length > 0 ? filters : undefined;
        const data = await fetchCampaignLoginSecurity(selectedCampaign, params);
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
    dateRange,
    loginType,
    userIdFilter,
    userIpFilter,
  ]);

  const metricsByKey = useMemo(() => {
    const entries = new Map<string, Metric>();
    (summary?.metrics ?? []).forEach((metric) =>
      entries.set(metric.key, metric),
    );
    return entries;
  }, [summary]);

  const activityDataset = useMemo(() => {
    if (!activity?.points) {
      return [];
    }

    return activity.points.map((point) => {
      const parsedDate = dayjs(point.date, "YYYY-MM-DD");

      return {
        ...point,
        day: parsedDate.isValid() ? parsedDate.toDate() : undefined,
        dateLabel: parsedDate.isValid()
          ? parsedDate.format("DD/MM/YYYY")
          : String(point.date ?? ""),
      };
    });
  }, [activity]);

  const activityWithCumulative = useMemo(() => {
    let cumulativeValue = 0;
    return activityDataset.map((point) => {
      const dailyValue =
        typeof point.redeemedValue === "number" ? point.redeemedValue : 0;
      cumulativeValue += dailyValue;
      return {
        ...point,
        cumulativeRedeemedValue: cumulativeValue,
      };
    });
  }, [activityDataset]);

  const conversionFunnelDataset = useMemo<ConversionFunnelChartDatum[]>(() => {
    if (!conversionFunnel?.series || conversionFunnel.series.length === 0) {
      return [];
    }

    const safeNumber = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    const normalizeRate = (value: number | null | undefined) => {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return null;
      }
      if (value < 0) {
        return 0;
      }
      if (value > 1) {
        return 1;
      }
      return Number(value.toFixed(4));
    };

    return conversionFunnel.series.map((entry) => {
      const start = dayjs(entry.weekStart, "YYYY-MM-DD", true);
      const endCandidate = entry.weekEnd
        ? dayjs(entry.weekEnd, "YYYY-MM-DD", true)
        : start.isValid()
          ? start.add(6, "day")
          : null;

      const startLabel = start.isValid()
        ? start.format("DD/MM")
        : entry.weekStart;
      const endLabel = endCandidate?.isValid()
        ? endCandidate.format("DD/MM")
        : entry.weekEnd ?? entry.weekStart;

      const loginUsers = safeNumber(entry.loginUsers);
      const awardRequests = safeNumber(entry.awardRequests);
      const redemptionUsers = safeNumber(entry.redemptionUsers);

      const loginOnlyUsers = Math.max(loginUsers - awardRequests, 0);
      const awardOnlyUsers = Math.max(awardRequests - redemptionUsers, 0);
      const redemptionUsersSegment = Math.max(redemptionUsers, 0);

      return {
        key: entry.weekStart,
        weekStart: entry.weekStart,
        weekEnd: entry.weekEnd ?? null,
        weekLabel: `${startLabel} → ${endLabel}`,
        weekRangeVerbose: `Semana del ${startLabel} al ${endLabel}`,
        loginUsers,
        awardRequests,
        redemptionUsers,
        loginOnlyUsers,
        awardOnlyUsers,
        redemptionUsersSegment,
        conversionRate: normalizeRate(entry.conversionRate),
        requestRate: normalizeRate(entry.requestRate),
        approvalRate: normalizeRate(entry.approvalRate),
        loginEvents: safeNumber(entry.loginEvents),
        awardEvents: safeNumber(entry.awardEvents),
        redemptionEvents: safeNumber(entry.redemptionEvents),
      };
    });
  }, [conversionFunnel]);

  const conversionFunnelAxisMax = useMemo(() => {
    if (conversionFunnelDataset.length === 0) {
      return 1;
    }
    let maxValue = 0;
    conversionFunnelDataset.forEach((entry) => {
      if (entry.loginUsers > maxValue) {
        maxValue = entry.loginUsers;
      }
    });
    if (maxValue <= 0) {
      return 1;
    }
    return Math.ceil(maxValue * 1.1);
  }, [conversionFunnelDataset]);

  const loginTypeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    LOGIN_TYPE_OPTIONS.forEach(({ value, label }) => {
      map.set(String(value), label);
    });
    (activity?.filters?.loginTypes ?? []).forEach(({ value, label }) => {
      if (value === undefined || value === null) {
        return;
      }
      const key = String(value);
      const cleanLabel = typeof label === "string" ? label.trim() : "";
      if (cleanLabel && cleanLabel !== key && !map.has(key)) {
        map.set(key, cleanLabel);
      }
    });
    map.set("", "Sin tipo");
    return map;
  }, [activity]);

  const loginTypeDistribution = useMemo(() => {
    const breakdown = activity?.loginTypeBreakdown ?? [];
    return breakdown.map((entry) => {
      const value =
        entry.type === null || entry.type === undefined
          ? ""
          : String(entry.type);
      const label =
        loginTypeLabelMap.get(value) ?? (value === "" ? "Sin tipo" : value);
      return {
        typeValue: value,
        typeLabel: label,
        logins: typeof entry.logins === "number" ? entry.logins : 0,
      };
    });
  }, [activity, loginTypeLabelMap]);

  const loginHeatmapData = useMemo(() => {
    const entries = activity?.loginHeatmap ?? [];

    if (!entries.length) {
      return {
        dayHeaders: [] as {
          value: number;
          label: string;
          fullLabel: string;
        }[],
        hourBuckets: [] as number[],
        valueMap: new Map<string, number>(),
        maxValue: 0,
        minValue: 0,
      };
    }

    const valueMap = new Map<string, number>();
    let maxValue = 0;
    let minValue: number | null = null;
    const daySet = new Set<number>();

    for (const entry of entries) {
      const day = Number(entry.dayOfWeek ?? entry.day_of_week ?? 0);
      const hourBucket = Number(entry.hourBucket ?? entry.hour_bucket ?? 0);
      if (!Number.isFinite(day) || !Number.isFinite(hourBucket)) {
        continue;
      }

      daySet.add(day);
      const logins = Number(entry.logins ?? 0);
      if (Number.isFinite(logins) && logins > 0) {
        if (logins > maxValue) {
          maxValue = logins;
        }
        if (minValue === null || logins < minValue) {
          minValue = logins;
        }
        const key = `${day}|${hourBucket}`;
        valueMap.set(key, (valueMap.get(key) ?? 0) + logins);
      }
    }

    const DAY_ORDER = [2, 3, 4, 5, 6, 7, 1];
    const DAY_LABELS: Record<number, { label: string; tooltip: string }> = {
      1: { label: "Dom", tooltip: "Domingo" },
      2: { label: "Lun", tooltip: "Lunes" },
      3: { label: "Mar", tooltip: "Martes" },
      4: { label: "Mié", tooltip: "Miércoles" },
      5: { label: "Jue", tooltip: "Jueves" },
      6: { label: "Vie", tooltip: "Viernes" },
      7: { label: "Sáb", tooltip: "Sábado" },
    };

    const dayHeaders = DAY_ORDER.filter((day) => daySet.has(day)).map((day) => {
      const labels = DAY_LABELS[day] ?? {
        label: String(day),
        tooltip: `Día ${day}`,
      };
      return {
        value: day,
        label: labels.label,
        fullLabel: labels.tooltip,
      };
    });

    if (dayHeaders.length === 0) {
      return {
        dayHeaders: [] as {
          value: number;
          label: string;
          fullLabel: string;
        }[],
        hourBuckets: [] as number[],
        valueMap: new Map<string, number>(),
        maxValue: 0,
        minValue: 0,
      };
    }

    const hourBuckets = Array.from({ length: 12 }, (_, idx) => idx);

    return {
      dayHeaders,
      hourBuckets,
      valueMap,
      maxValue,
      minValue: minValue ?? 0,
    };
  }, [activity]);

  const segmentRedemptionChartData = useMemo<SegmentRedemptionBreakdownEntry[]>(() => {
    const chart = summary?.charts?.find(
      (item) => item.key === SEGMENT_REDEMPTION_CHART_KEY,
    );
    if (!chart || !Array.isArray(chart.data)) {
      return [];
    }

    const toNumber = (value: unknown) => {
      if (value === null || value === undefined) {
        return 0;
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return chart.data
      .map((rawRow) => {
        const row = rawRow as Record<string, unknown>;
        const rawSegment =
          typeof row.segment_label === "string"
            ? row.segment_label
            : typeof row.segment === "string"
              ? row.segment
              : "";
        const segment = rawSegment.trim() ? rawSegment.trim() : "Sin segmento";
        const uniqueRedeemers = toNumber(
          row.unique_redeemers ?? row.uniqueRedeemers ?? row.uniqueRedeemer,
        );
        const totalRedemptions = toNumber(
          row.total_redemptions ??
            row.totalRedemptions ??
            row.redemptions ??
            row.total_redemption,
        );
        const redeemedValue = toNumber(
          row.redeemed_value ??
            row.redeemedValue ??
            row.total_value ??
            row.totalValue,
        );
        const averageTicketRaw =
          row.average_ticket ?? row.averageTicket ?? null;
        const averageTicket =
          averageTicketRaw === null || averageTicketRaw === undefined
            ? uniqueRedeemers > 0
              ? redeemedValue / uniqueRedeemers
              : null
            : (() => {
                const numeric = toNumber(averageTicketRaw);
                return Number.isFinite(numeric) ? numeric : null;
              })();

        return {
          segment,
          uniqueRedeemers,
          totalRedemptions,
          redeemedValue,
          averageTicket,
        };
      })
      .filter(
        (entry) =>
          entry.totalRedemptions > 0 ||
          entry.redeemedValue > 0 ||
          entry.uniqueRedeemers > 0,
      );
  }, [summary]);

  const segmentRedemptionAxisExtents = useMemo(() => {
    if (segmentRedemptionChartData.length === 0) {
      return {
        counts: 1,
        value: 1,
      };
    }

    let maxCount = 0;
    let maxValue = 0;
    segmentRedemptionChartData.forEach((entry) => {
      if (entry.uniqueRedeemers > maxCount) {
        maxCount = entry.uniqueRedeemers;
      }
      if (entry.totalRedemptions > maxCount) {
        maxCount = entry.totalRedemptions;
      }
      if (entry.redeemedValue > maxValue) {
        maxValue = entry.redeemedValue;
      }
    });

    const padCount = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return 1;
      }
      return Math.max(Math.ceil(value * 1.1), 1);
    };

    const padCurrency = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return 1;
      }
      const padded = value * 1.1;
      const magnitude = 10 ** Math.max(Math.floor(Math.log10(padded)) - 1, 0);
      return Math.ceil(padded / magnitude) * magnitude;
    };

    return {
      counts: padCount(maxCount),
      value: padCurrency(maxValue),
    };
  }, [segmentRedemptionChartData]);

  const axisExtents = useMemo(() => {
    const padCount = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return 1;
      }
      return Math.max(Math.ceil(value * 1.1), 1);
    };

    const padCurrency = (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return 1;
      }
      const padded = value * 1.1;
      const magnitude = 10 ** Math.max(Math.floor(Math.log10(padded)) - 1, 0);
      return Math.ceil(padded / magnitude) * magnitude;
    };

    let maxLogins = 0;
    let maxRedemptions = 0;
    let runningRedeemedValue = 0;
    let maxCumulativeRedeemedValue = 0;
    activityDataset.forEach((point) => {
      const loginsValue =
        typeof point.loginsCount === "number" ? point.loginsCount : 0;
      const redemptionsValue =
        typeof point.redemptionsCount === "number" ? point.redemptionsCount : 0;
      const redeemedValue =
        typeof point.redeemedValue === "number" ? point.redeemedValue : 0;
      if (loginsValue > maxLogins) {
        maxLogins = loginsValue;
      }
      if (redemptionsValue > maxRedemptions) {
        maxRedemptions = redemptionsValue;
      }
      runningRedeemedValue += redeemedValue;
      if (runningRedeemedValue > maxCumulativeRedeemedValue) {
        maxCumulativeRedeemedValue = runningRedeemedValue;
      }
    });

    return {
      logins: padCount(maxLogins),
      redemptions: padCount(maxRedemptions),
      cumulativeRedeemedValue: padCurrency(maxCumulativeRedeemedValue),
    };
  }, [activityDataset]);

  const loginSecurityNotes = loginSecurity?.metadata?.notes ?? [];
  const loginSecurityDebug = loginSecurity?.metadata?.debug;

  const loginSecurityTopLoginData = useMemo(() => {
    if (!loginSecurity?.topLoginIps) {
      return [];
    }
    return loginSecurity.topLoginIps.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      ipLabel: entry.ip ?? "Sin IP",
    }));
  }, [loginSecurity]);

  const loginSecurityTopRedemptionData = useMemo(() => {
    if (!loginSecurity?.topRedemptionIps) {
      return [];
    }
    return loginSecurity.topRedemptionIps.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      ipLabel: entry.ip ?? "Sin IP",
    }));
  }, [loginSecurity]);

  const loginSecurityDetailRows = useMemo<LoginSecurityDetailRow[]>(
    () => loginSecurity?.loginIpDetails ?? [],
    [loginSecurity],
  );

  const loginSecurityAtypicalRows = useMemo<LoginSecurityAtypicalIp[]>(
    () => loginSecurity?.atypicalIps ?? [],
    [loginSecurity],
  );

  const twoFactorHeatmapData = useMemo<TwoFactorHeatmapData>(() => {
    const info = loginSecurity?.twoFactorAdoption;
    const normalizedTarget =
      typeof info?.targetRate === "number"
        ? Math.min(Math.max(info.targetRate, 0), 1)
        : null;

    if (!info || !Array.isArray(info.entries) || info.entries.length === 0) {
      const totals = info?.totals ?? EMPTY_TWO_FACTOR_TOTALS;
      return {
        weeks: [],
        segments: [],
        valueMap: new Map<string, TwoFactorHeatmapMetrics>(),
        maxRate:
          normalizedTarget && normalizedTarget > 0 ? normalizedTarget : 0,
        minRate: 0,
        targetRate: normalizedTarget,
        totals: { ...totals },
      };
    }

    const weeks = info.weeks.map((week) => {
      const start = dayjs(week.start, "YYYY-MM-DD", true);
      const endRaw =
        week.end && dayjs(week.end, "YYYY-MM-DD", true).isValid()
          ? dayjs(week.end, "YYYY-MM-DD", true)
          : start.isValid()
            ? start.add(6, "day")
            : null;
      const label = start.isValid() ? start.format("DD/MM") : week.start;
      const tooltip = start.isValid()
        ? endRaw && endRaw.isValid()
          ? `${start.format("DD/MM/YYYY")} – ${endRaw.format("DD/MM/YYYY")}`
          : start.format("DD/MM/YYYY")
        : week.start;
      return {
        value: week.start,
        label,
        tooltip,
      };
    });

    const segments = info.segments.map((segment) => ({
      value: segment,
      label: segment,
    }));

    const valueMap = new Map<string, TwoFactorHeatmapMetrics>();
    let maxRate = 0;
    let minRate: number | null = null;

    info.entries.forEach((entry) => {
      const key = `${entry.segment}|${entry.weekStart}`;
      const rawRate =
        typeof entry.adoptionRate === "number"
          ? entry.adoptionRate
          : entry.totalUsers > 0
            ? entry.usersWithTwoFactor / entry.totalUsers
            : 0;
      const rate = Math.min(Math.max(rawRate, 0), 1);
      valueMap.set(key, {
        rate,
        usersWithTwoFactor: entry.usersWithTwoFactor,
        totalUsers: entry.totalUsers,
      });
      if (rate > maxRate) {
        maxRate = rate;
      }
      if (minRate === null || rate < minRate) {
        minRate = rate;
      }
    });

    const colorMax =
      maxRate > 0
        ? Math.max(maxRate, normalizedTarget ?? 0)
        : normalizedTarget && normalizedTarget > 0
          ? normalizedTarget
          : 1;

    const totals = info.totals ?? EMPTY_TWO_FACTOR_TOTALS;

    return {
      weeks,
      segments,
      valueMap,
      maxRate: colorMax,
      minRate: minRate ?? 0,
      targetRate: normalizedTarget,
      totals: { ...totals },
    };
  }, [loginSecurity]);

  const loginSecurityDetailColumns = useMemo<
    ColumnsType<LoginSecurityDetailRow>
  >(
    () => [
      {
        title: "IP",
        dataIndex: "ip",
        key: "ip",
        render: (value: string | null) =>
          value ? (
            <Text code>{value}</Text>
          ) : (
            <Text type="secondary">Sin IP</Text>
          ),
      },
      {
        title: "Idmask",
        dataIndex: "idmask",
        key: "idmask",
        render: (value: string | null) =>
          value ? (
            <Text>{value}</Text>
          ) : (
            <Text type="secondary">Sin idmask</Text>
          ),
      },
      {
        title: "Logins",
        dataIndex: "loginCount",
        key: "loginCount",
        align: "right",
        render: (value: number) => formatNumber(value),
      },
      {
        title: "Redenciones",
        dataIndex: "redemptions",
        key: "redemptions",
        align: "right",
        render: (value: number) => formatNumber(value),
      },
      {
        title: "Conversión",
        dataIndex: "conversionRate",
        key: "conversionRate",
        align: "right",
        render: (value: number | null) =>
          typeof value === "number" && Number.isFinite(value)
            ? formatPercentage(value)
            : "N/D",
      },
      {
        title: "Días activos",
        dataIndex: "activeDays",
        key: "activeDays",
        align: "right",
        render: (value: number) => formatNumber(value),
      },
      {
        title: "Valor redimido",
        dataIndex: "totalRedeemedValue",
        key: "totalRedeemedValue",
        align: "right",
        render: (value: number) => formatValue(value, "currency"),
      },
      {
        title: "Último login",
        dataIndex: "lastLoginAt",
        key: "lastLoginAt",
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: "Última redención",
        dataIndex: "lastRedemptionAt",
        key: "lastRedemptionAt",
        render: (value: string | null) => formatDateTime(value),
      },
    ],
    [],
  );

  const loginSecurityAtypicalColumns = useMemo<
    ColumnsType<LoginSecurityAtypicalIp>
  >(
    () => [
      {
        title: "Nivel",
        dataIndex: "severity",
        key: "severity",
        render: (value: LoginSecurityAtypicalIp["severity"]) => (
          <Tag color={SEVERITY_COLORS[value]}>{SEVERITY_LABELS[value]}</Tag>
        ),
      },
      {
        title: "IP",
        dataIndex: "ip",
        key: "ip",
        render: (value: string) => <Text code>{value}</Text>,
      },
      {
        title: "Logins / usuarios",
        key: "logins",
        render: (_: unknown, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{formatNumber(record.totalLogins)}</Text>
            <Text type="secondary">
              Usuarios: {formatNumber(record.uniqueUsers)}
            </Text>
          </Space>
        ),
      },
      {
        title: "Redenciones / usuarios",
        key: "redemptions",
        render: (_: unknown, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{formatNumber(record.totalRedemptions)}</Text>
            <Text type="secondary">
              Usuarios: {formatNumber(record.uniqueRedeemers)}
            </Text>
          </Space>
        ),
      },
      {
        title: "Conversión",
        dataIndex: "conversionRate",
        key: "conversionRate",
        align: "right",
        render: (value: number) => formatPercentage(value),
      },
      {
        title: "Redenciones/día activo",
        dataIndex: "redemptionsPerActiveDay",
        key: "redemptionsPerActiveDay",
        align: "right",
        render: (value: number | null) =>
          typeof value === "number" && Number.isFinite(value)
            ? value.toFixed(2)
            : "N/D",
      },
      {
        title: "Ventana de actividad",
        key: "activityWindow",
        render: (_: unknown, record) => {
          const rangeLabel =
            record.firstActivityAt && record.lastActivityAt
              ? `${formatDateTime(record.firstActivityAt)} → ${formatDateTime(
                  record.lastActivityAt,
                )}`
              : formatDateTime(record.firstActivityAt ?? record.lastActivityAt);

          return (
            <Space direction="vertical" size={0}>
              <Text>{rangeLabel}</Text>
              <Text type="secondary">
                Login: {formatDays(record.loginSpanDays)} · Redención:{" "}
                {formatDays(record.redemptionSpanDays)}
              </Text>
            </Space>
          );
        },
      },
      {
        title: "Motivos detectados",
        dataIndex: "reasons",
        key: "reasons",
        render: (reasons: string[]) =>
          reasons.length > 0 ? (
            <Space size={[4, 4]} wrap>
              {reasons.map((reason) => (
                <Tag key={reason} color="magenta">
                  {reason}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">Sin patrones atípicos</Text>
          ),
      },
    ],
    [],
  );

  const userColumns = useMemo<ColumnsType<DashboardUser>>(
    () => [
      {
        title: "Usuario",
        dataIndex: "name",
        key: "name",
        render: (_: string, record) => (
          <Space direction="vertical" size={0}>
            <Text strong>{record.name || record.email}</Text>
            <Text type="secondary">{record.email}</Text>
          </Space>
        ),
      },
      {
        title: "Rol",
        dataIndex: "role",
        key: "role",
        render: (value: DashboardUser["role"]) => ROLE_LABELS[value] || value,
      },
      {
        title: "Campañas",
        dataIndex: "allowedCampaignIds",
        key: "allowedCampaignIds",
        render: (_: unknown, record) => {
          const allowed = record.allowedCampaignIds ?? [];
          if (allowed.length === 0) {
            return <Tag color="volcano">Sin acceso</Tag>;
          }
          if (totalCampaignCount > 0 && allowed.length === totalCampaignCount) {
            return <Tag color="blue">Todas</Tag>;
          }
          return (
            <Space size={[4, 4]} wrap>
              {allowed.map((id) => (
                <Tag key={`${record.id}-${id}`}>{campaignNameMap.get(id) ?? id}</Tag>
              ))}
            </Space>
          );
        },
      },
      {
        title: "Estado",
        dataIndex: "status",
        key: "status",
        render: (value: string, record) => (
          <Space size={[4, 4]} wrap>
            {value === "active" ? (
              <Tag color="green">Activo</Tag>
            ) : (
              <Tag color="volcano">{value}</Tag>
            )}
            {record.mustResetPassword ? (
              <Tag color="gold">Cambio requerido</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "Creado",
        dataIndex: "createdAt",
        key: "createdAt",
        render: (value: string) => formatDateTime(value),
      },
      {
        title: "Acciones",
        key: "actions",
        render: (_: unknown, record) => (
          <Space>
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleOpenEditUser(record)}
            >
              Editar
            </Button>
            {record.id === currentUser.id ? (
              <Tooltip title="No puedes eliminar tu propia cuenta.">
                <Button danger icon={<DeleteOutlined />} size="small" disabled>
                  Eliminar
                </Button>
              </Tooltip>
            ) : (
              <Popconfirm
                title="Eliminar usuario"
                description="Esta acción revocará el acceso al dashboard."
                okText="Sí, eliminar"
                cancelText="Cancelar"
                okButtonProps={{ loading: deletingUserId === record.id }}
                onConfirm={() => handleDeleteUser(record)}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  loading={deletingUserId === record.id}
                >
                  Eliminar
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [campaignNameMap, currentUser.id, deletingUserId, totalCampaignCount, handleOpenEditUser, handleDeleteUser],
  );

  const userTableData = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => {
          if (a.role !== b.role) {
            return a.role === "admin" ? -1 : 1;
          }
          return a.email.localeCompare(b.email);
        })
        .map((user) => ({ ...user, key: user.id })),
    [users],
  );

  const isEditingUser = Boolean(editingUser);
  const userModalTitle = isEditingUser ? "Editar usuario" : "Nuevo usuario";

  const hasTopLoginIps = loginSecurityTopLoginData.length > 0;
  const hasTopRedemptionIps = loginSecurityTopRedemptionData.length > 0;

  const redemptionAmountChartData = useMemo(() => {
    const entries = redemptionInsights?.amountDistribution ?? [];
    return entries
      .filter((entry) => entry.amount > 0 && entry.redemptions > 0)
      .map((entry) => ({
        amount: entry.amount,
        amountLabel: formatValue(entry.amount, "currency"),
        redemptions: entry.redemptions,
        totalValue: entry.totalValue,
        uniqueUsers: entry.uniqueUsers,
      }));
  }, [redemptionInsights]);

  const merchantPieData = useMemo(() => {
    const slices = redemptionInsights?.merchantPie ?? [];
    const total = slices.reduce((acc, slice) => acc + slice.redemptions, 0);
    return slices.map((slice, index) => ({
      ...slice,
      color: REDEMPTION_PIE_COLORS[index % REDEMPTION_PIE_COLORS.length],
      percentage: total > 0 ? (slice.redemptions / total) * 100 : 0,
    }));
  }, [redemptionInsights]);

  const redemptionHeatmapData = useMemo(() => {
    const merchants = redemptionInsights?.heatmap?.merchants ?? [];
    const amounts = redemptionInsights?.heatmap?.amounts ?? [];
    const cells = redemptionInsights?.heatmap?.cells ?? [];
    const valueMap = new Map<
      string,
      { redemptions: number; totalValue: number }
    >();
    cells.forEach((cell) => {
      valueMap.set(`${cell.merchant}|${cell.amount}`, {
        redemptions: cell.redemptions,
        totalValue: cell.totalValue,
      });
    });

    const maxValue = redemptionInsights?.heatmap?.maxRedemptions ?? 0;
    const minPositive =
      redemptionInsights?.heatmap?.minPositiveRedemptions !== null &&
      redemptionInsights?.heatmap?.minPositiveRedemptions !== undefined
        ? redemptionInsights.heatmap.minPositiveRedemptions
        : 0;

    return {
      merchants,
      amounts,
      valueMap,
      maxValue,
      minPositiveValue:
        typeof minPositive === "number" && minPositive > 0 ? minPositive : 0,
    };
  }, [redemptionInsights]);

  const redemptionTableData = useMemo<RedemptionTableRow[]>(() => {
    const rows = redemptionInsights?.merchantTotals ?? [];
    return rows.map((row) => {
      const averageValue =
        row.redemptions > 0 ? row.totalValue / row.redemptions : 0;
      return {
        key: row.merchant,
        merchant: row.merchant,
        redemptions: row.redemptions,
        uniqueUsers: row.uniqueUsers,
        totalValue: row.totalValue,
        averageValue,
      };
    });
  }, [redemptionInsights]);

  const redemptionTableColumns = useMemo<ColumnsType<RedemptionTableRow>>(
    () => [
      {
        title: "Comercio",
        dataIndex: "merchant",
        key: "merchant",
      },
      {
        title: "Redenciones",
        dataIndex: "redemptions",
        key: "redemptions",
        render: (value: number) => formatNumber(value),
      },
      {
        title: "Usuarios únicos",
        dataIndex: "uniqueUsers",
        key: "uniqueUsers",
        render: (value: number) => formatNumber(value),
      },
      {
        title: "Valor redimido",
        dataIndex: "totalValue",
        key: "totalValue",
        render: (value: number) => formatValue(value, "currency"),
      },
      {
        title: "Ticket promedio",
        dataIndex: "averageValue",
        key: "averageValue",
        render: (value: number) => formatValue(value, "currency"),
      },
    ],
    [],
  );

  const hasActivityData = activityDataset.length > 0;
  const hasConversionFunnelData = conversionFunnelDataset.length > 0;
  const hasLoginTypeDistribution = loginTypeDistribution.length > 0;
  const hasHeatmapData = loginHeatmapData.dayHeaders.length > 0;
  const hasSegmentRedemptionData =
    segmentRedemptionChartData.length > 0;
  const hasRedemptionAmountData = redemptionAmountChartData.length > 0;
  const hasMerchantPieData = merchantPieData.length > 0;
  const hasRedemptionHeatmapData =
    redemptionHeatmapData.merchants.length > 0 &&
    redemptionHeatmapData.amounts.length > 0;
  const hasRedemptionTableData = redemptionTableData.length > 0;
  const hasTwoFactorHeatmap =
    twoFactorHeatmapData.weeks.length > 0 &&
    twoFactorHeatmapData.segments.length > 0;

  const getHeatmapColor = (
    value: number,
    maxValue: number,
    minValue: number,
  ) => {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(maxValue) ||
      !Number.isFinite(minValue)
    ) {
      return "#f5f5f5";
    }
    if (maxValue <= minValue) {
      return "#f5f5f5";
    }

    const ratio = Math.min(
      Math.max((value - minValue) / (maxValue - minValue), 0),
      1,
    );

    // Mastercard palette: low -> #f79e1b (naranja), mid -> #ffffff, high -> #eb001b (rojo)
    if (ratio < 0.5) {
      const t = ratio / 0.5;
      const start = { r: 247, g: 158, b: 27 };
      const end = { r: 255, g: 255, b: 255 };
      const r = Math.round(start.r + (end.r - start.r) * t);
      const g = Math.round(start.g + (end.g - start.g) * t);
      const b = Math.round(start.b + (end.b - start.b) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }

    const t = (ratio - 0.5) / 0.5;
    const start = { r: 255, g: 255, b: 255 };
    const end = { r: 235, g: 0, b: 27 };
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const formatHourLabel = (bucket: number) => {
    if (!Number.isFinite(bucket)) {
      return "";
    }
    const startHour = Math.max(0, Math.floor(bucket) * 2);
    const endHour = Math.min(23, startHour + 1);
    const format = (value: number) => `${value.toString().padStart(2, "0")}:00`;
    const formatEnd = (value: number) =>
      `${value.toString().padStart(2, "0")}:59`;
    return `${format(startHour)} - ${formatEnd(endHour)}`;
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
    if (selectedMenu === "overview") {
      return (
        <>
          <Row gutter={[24, 32]} align="stretch">
            <Col xs={24} xl={12} className="activity-col">
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Actividad temporal combinada
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Logins y redenciones diarios por campaña seleccionada.
                  </Text>
                </div>

                {activityError && (
                  <Alert type="error" message={activityError} showIcon />
                )}

                <div className="activity-body">
                  <Spin spinning={loadingActivity}>
                    {hasActivityData ? (
                      <div className="activity-chart activity-chart--wide">
                        <ResponsiveContainer width="100%" height={380}>
                          <ReLineChart
                            data={activityDataset}
                            margin={{
                              top: 24,
                              right: 48,
                              left: 48,
                              bottom: 24,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="dateLabel"
                              tick={{ fontSize: 12 }}
                              height={50}
                              tickMargin={12}
                              label={{
                                value: "Fecha",
                                position: "insideBottom",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="logins"
                              domain={[0, axisExtents.logins]}
                              tickFormatter={(value: number) =>
                                formatNumber(value)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Logins diarios",
                                angle: -90,
                                position: "insideLeft",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="redemptions"
                              orientation="right"
                              domain={[0, axisExtents.redemptions]}
                              tickFormatter={(value: number) =>
                                formatNumber(value)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Redenciones diarias",
                                angle: -90,
                                position: "insideRight",
                                offset: -4,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <RechartsTooltip
                              formatter={(value: number, name: string) => [
                                formatNumber(value),
                                name,
                              ]}
                              labelFormatter={(label: string) => label}
                            />
                            <RechartsLegend
                              verticalAlign="top"
                              align="center"
                              wrapperStyle={{ paddingBottom: 16 }}
                              formatter={(value: string) => value}
                            />
                            <Line
                              yAxisId="logins"
                              type="monotone"
                              dataKey="loginsCount"
                              name="Logins diarios"
                              stroke="#eb001b"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              yAxisId="redemptions"
                              type="monotone"
                              dataKey="redemptionsCount"
                              name="Redenciones diarias"
                              stroke="#f79e1b"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            {(activity?.annotations ?? []).map((annotation) => (
                              <ReferenceLine
                                key={`${annotation.date}-${annotation.label}`}
                                x={dayjs(annotation.date, "YYYY-MM-DD").format(
                                  "DD/MM/YYYY",
                                )}
                                stroke="#8b8b8b"
                                strokeDasharray="4 4"
                                label={{
                                  value: annotation.label,
                                  position: "top",
                                  fill: "#444444",
                                  fontSize: 11,
                                }}
                              />
                            ))}
                          </ReLineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      !loadingActivity && (
                        <div className="activity-empty">
                          <Empty description="No hay actividad disponible para el periodo seleccionado." />
                        </div>
                      )
                    )}
                  </Spin>

                  {(activity?.annotations?.length ?? 0) > 0 && (
                    <Space size={[8, 8]} wrap>
                      {activity?.annotations?.map((annotation) => {
                        const displayDate = dayjs(
                          annotation.date,
                          "YYYY-MM-DD",
                        ).format("DD/MM/YYYY");
                        const tagContent = `${displayDate} · ${annotation.label}`;
                        return (
                          <Tooltip
                            key={`${annotation.date}-${annotation.label}-tag`}
                            title={
                              annotation.description ??
                              (annotation.campaignName
                                ? `Hito reportado en ${annotation.campaignName}`
                                : undefined)
                            }
                          >
                            <Tag color="magenta">{tagContent}</Tag>
                          </Tooltip>
                        );
                      })}
                    </Space>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={12} className="activity-col">
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Valor acumulado vs redenciones diarias
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Suma acumulada en COP frente a redenciones diarias para los
                    filtros actuales.
                  </Text>
                </div>

                <div className="activity-body">
                  <Spin spinning={loadingActivity}>
                    {hasActivityData ? (
                      <div className="activity-chart activity-chart--wide">
                        <ResponsiveContainer width="100%" height={380}>
                          <ReLineChart
                            data={activityWithCumulative}
                            margin={{
                              top: 24,
                              right: 48,
                              left: 48,
                              bottom: 24,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="dateLabel"
                              tick={{ fontSize: 12 }}
                              height={50}
                              tickMargin={12}
                              label={{
                                value: "Fecha",
                                position: "insideBottom",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="dailyRedemptions"
                              domain={[0, axisExtents.redemptions]}
                              tickFormatter={(value: number) =>
                                formatNumber(value)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Redenciones diarias",
                                angle: -90,
                                position: "insideLeft",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="redeemedValue"
                              orientation="right"
                              domain={[0, axisExtents.cumulativeRedeemedValue]}
                              tickFormatter={(value: number) =>
                                formatValue(value, "currency")
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Valor acumulado (COP)",
                                angle: -90,
                                position: "insideRight",
                                offset: -8,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <RechartsTooltip
                              formatter={(
                                valueParam: number | string,
                                name: string,
                              ) => {
                                const numericValue =
                                  typeof valueParam === "number"
                                    ? valueParam
                                    : Number(valueParam);
                                const displayValue = Number.isFinite(
                                  numericValue,
                                )
                                  ? name === "Valor acumulado en redenciones"
                                    ? formatValue(numericValue, "currency")
                                    : formatNumber(numericValue)
                                  : "N/D";
                                return [displayValue, name];
                              }}
                              labelFormatter={(label: string) => label}
                            />
                            <RechartsLegend
                              verticalAlign="top"
                              align="center"
                              wrapperStyle={{ paddingBottom: 16 }}
                              formatter={(value: string) => value}
                            />
                            <Line
                              yAxisId="dailyRedemptions"
                              type="monotone"
                              dataKey="redemptionsCount"
                              name="Redenciones diarias"
                              stroke="#f79e1b"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              yAxisId="redeemedValue"
                              type="monotone"
                              dataKey="cumulativeRedeemedValue"
                              name="Valor acumulado en redenciones"
                              stroke="#003087"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            {(activity?.annotations ?? []).map((annotation) => (
                              <ReferenceLine
                                key={`cumulative-${annotation.date}-${annotation.label}`}
                                x={dayjs(annotation.date, "YYYY-MM-DD").format(
                                  "DD/MM/YYYY",
                                )}
                                stroke="#8b8b8b"
                                strokeDasharray="4 4"
                                label={{
                                  value: annotation.label,
                                  position: "top",
                                  fill: "#444444",
                                  fontSize: 11,
                                }}
                              />
                            ))}
                          </ReLineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      !loadingActivity && (
                        <div className="activity-empty">
                          <Empty description="No hay actividad disponible para el periodo seleccionado." />
                        </div>
                      )
                    )}
                  </Spin>
                </div>
              </Card>
            </Col>
          </Row>
          <Row gutter={[24, 32]} align="stretch">
            <Col span={24}>
              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Conversión login → redención
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Evolución semanal de usuarios que pasan del login a la
                    solicitud de premio y a la redención con los filtros
                    aplicados.
                  </Text>
                </div>
                {conversionFunnelError && (
                  <Alert type="error" message={conversionFunnelError} showIcon />
                )}
                <div className="activity-body">
                  <Spin spinning={loadingConversionFunnel}>
                    {hasConversionFunnelData ? (
                      <div className="activity-chart activity-chart--wide">
                        <ResponsiveContainer width="100%" height={420}>
                          <ReComposedChart
                            data={conversionFunnelDataset}
                            margin={{
                              top: 24,
                              right: 48,
                              left: 48,
                              bottom: 24,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="weekLabel"
                              tick={{ fontSize: 12 }}
                              height={50}
                              tickMargin={12}
                              label={{
                                value: "Semana",
                                position: "insideBottom",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="users"
                              domain={[0, conversionFunnelAxisMax]}
                              tickFormatter={(value: number) =>
                                formatNumber(value)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Usuarios",
                                angle: -90,
                                position: "insideLeft",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="rate"
                              orientation="right"
                              domain={[0, 1]}
                              tickFormatter={(value: number) =>
                                formatPercentage(value, 0)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Conversión",
                                angle: -90,
                                position: "insideRight",
                                offset: -4,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <RechartsTooltip
                              formatter={(
                                rawValue: number | string,
                                name: string,
                                payloadItem: { payload?: ConversionFunnelChartDatum },
                              ) => {
                                const data = payloadItem?.payload;
                                if (name === "Conversión total") {
                                  const numeric =
                                    typeof rawValue === "number"
                                      ? rawValue
                                      : Number(rawValue);
                                  return [
                                    formatPercentage(
                                      Number.isFinite(numeric) ? numeric : 0,
                                    ),
                                    name,
                                  ];
                                }
                                if (!data) {
                                  const numeric =
                                    typeof rawValue === "number"
                                      ? rawValue
                                      : Number(rawValue);
                                  return [
                                    formatNumber(
                                      Number.isFinite(numeric) ? numeric : 0,
                                    ),
                                    name,
                                  ];
                                }
                                if (name === "Usuarios con login") {
                                  return [formatNumber(data.loginUsers), name];
                                }
                                if (name === "Solicitudes de premio") {
                                  return [
                                    formatNumber(data.awardRequests),
                                    name,
                                  ];
                                }
                                if (name === "Usuarios con redención") {
                                  return [
                                    formatNumber(data.redemptionUsers),
                                    name,
                                  ];
                                }
                                const numeric =
                                  typeof rawValue === "number"
                                    ? rawValue
                                    : Number(rawValue);
                                return [
                                  formatNumber(
                                    Number.isFinite(numeric) ? numeric : 0,
                                  ),
                                  name,
                                ];
                              }}
                              labelFormatter={(_label, payload) => {
                                const data = (
                                  payload && payload.length > 0
                                    ? payload[0].payload
                                    : undefined
                                ) as ConversionFunnelChartDatum | undefined;
                                if (!data) {
                                  return null;
                                }
                                const requestRateLabel =
                                  data.requestRate !== null
                                    ? formatPercentage(data.requestRate)
                                    : "N/D";
                                const approvalRateLabel =
                                  data.approvalRate !== null
                                    ? formatPercentage(data.approvalRate)
                                    : "N/D";
                                return (
                                  <div>
                                    <div>{data.weekRangeVerbose}</div>
                                    <div style={{ fontSize: 12, color: "#666" }}>
                                      Tasa solicitud: {requestRateLabel} ·
                                      Aprobación: {approvalRateLabel}
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <RechartsLegend
                              verticalAlign="top"
                              align="center"
                              wrapperStyle={{ paddingBottom: 16 }}
                            />
                            <Bar
                              yAxisId="users"
                              dataKey="loginOnlyUsers"
                              name="Usuarios con login"
                              stackId="funnel"
                              fill="#ffd7b5"
                              isAnimationActive={false}
                            />
                            <Bar
                              yAxisId="users"
                              dataKey="awardOnlyUsers"
                              name="Solicitudes de premio"
                              stackId="funnel"
                              fill="#f79e1b"
                              isAnimationActive={false}
                            />
                            <Bar
                              yAxisId="users"
                              dataKey="redemptionUsersSegment"
                              name="Usuarios con redención"
                              stackId="funnel"
                              fill="#eb001b"
                              isAnimationActive={false}
                            />
                            <Line
                              yAxisId="rate"
                              type="monotone"
                              dataKey="conversionRate"
                              name="Conversión total"
                              stroke="#003087"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                          </ReComposedChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      !loadingConversionFunnel && (
                        <div className="activity-empty">
                          <Empty description="No se encontraron datos de conversión para los filtros actuales." />
                        </div>
                      )
                    )}
                  </Spin>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      );
    }
    if (selectedMenu === "redemptions") {
      return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {selectedCampaign === "all" ? (
            <Card>
              <Empty description="Selecciona una campaña puntual para analizar las redenciones." />
            </Card>
          ) : redemptionError ? (
            <Alert type="error" message={redemptionError} showIcon />
          ) : (
            <Spin spinning={loadingRedemptionInsights}>
              {redemptionInsights ? (
                <Space
                  direction="vertical"
                  size="large"
                  style={{ width: "100%" }}
                >
                  <Row gutter={[24, 32]} align="stretch">
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              Distribución por monto de bono
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Cantidad de redenciones agrupadas por valor del bono
                            canjeado.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasRedemptionAmountData ? (
                            <div className="activity-chart activity-chart--wide">
                              <ResponsiveContainer width="100%" height={360}>
                                <ReBarChart
                                  data={redemptionAmountChartData}
                                  margin={{
                                    top: 24,
                                    right: 32,
                                    left: 32,
                                    bottom: 48,
                                  }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                  />
                                  <XAxis
                                    dataKey="amountLabel"
                                    tick={{ fontSize: 12 }}
                                    interval={0}
                                    angle={-20}
                                    textAnchor="end"
                                    height={70}
                                    tickMargin={12}
                                    label={{
                                      value: "Monto del bono",
                                      position: "insideBottom",
                                      offset: -12,
                                      style: { textAnchor: "middle" },
                                    }}
                                  />
                                  <YAxis
                                    tickFormatter={(value: number) =>
                                      formatNumber(value)
                                    }
                                    tick={{ fontSize: 12 }}
                                    label={{
                                      value: "Redenciones",
                                      angle: -90,
                                      position: "insideLeft",
                                      offset: -10,
                                      style: { textAnchor: "middle" },
                                    }}
                                  />
                                  <RechartsTooltip
                                    formatter={(value: number | string) => {
                                      const redemptions =
                                        typeof value === "number"
                                          ? value
                                          : Number(value);
                                      return [
                                        formatNumber(
                                          Number.isFinite(redemptions)
                                            ? redemptions
                                            : 0,
                                        ),
                                        "Redenciones",
                                      ];
                                    }}
                                    labelFormatter={(label: string, items) => {
                                      const totalValue =
                                        items?.[0]?.payload?.totalValue ?? 0;
                                      return `${label} · ${formatValue(
                                        totalValue,
                                        "currency",
                                      )}`;
                                    }}
                                  />
                                  <Bar
                                    dataKey="redemptions"
                                    name="Redenciones"
                                    fill="#eb001b"
                                    radius={[4, 4, 0, 0]}
                                    isAnimationActive={false}
                                  />
                                </ReBarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="activity-empty">
                              <Empty description="No hay redenciones para agrupar por monto con los filtros actuales." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              Top comercios por redenciones
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Participación de los comercios con mayor cantidad de
                            redenciones. Los que exceden el top 10 se agrupan en
                            “Otros”.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasMerchantPieData ? (
                            <div className="activity-chart activity-chart--wide">
                              <ResponsiveContainer width="100%" height={360}>
                                <RePieChart>
                                  <RechartsTooltip
                                    formatter={(
                                      value: number | string,
                                      name,
                                    ) => {
                                      const numeric =
                                        typeof value === "number"
                                          ? value
                                          : Number(value);
                                      const safe = Number.isFinite(numeric)
                                        ? numeric
                                        : 0;
                                      return [
                                        `${formatNumber(safe)} redenciones`,
                                        name,
                                      ];
                                    }}
                                  />
                                  <RechartsLegend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                  />
                                  <Pie
                                    data={merchantPieData}
                                    dataKey="redemptions"
                                    nameKey="merchant"
                                    innerRadius={70}
                                    outerRadius={120}
                                    paddingAngle={2}
                                    isAnimationActive={false}
                                    label={({ merchant, percentage }) =>
                                      `${merchant}: ${percentage.toFixed(1)}%`
                                    }
                                  >
                                    {merchantPieData.map((slice, index) => (
                                      <Cell
                                        key={`merchant-slice-${slice.merchant}-${index}`}
                                        fill={slice.color}
                                      />
                                    ))}
                                  </Pie>
                                </RePieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="activity-empty">
                              <Empty description="No se encontraron comercios con redenciones para graficar." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={[24, 32]} align="stretch">
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              Heatmap comercios vs montos
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Intensidad de redenciones cruzando los comercios y
                            los montos más frecuentes.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasRedemptionHeatmapData ? (
                            <div
                              className="activity-chart activity-chart--heatmap"
                              style={{ minHeight: 0 }}
                            >
                              <div
                                className="heatmap-grid"
                                style={{
                                  gridTemplateColumns: `140px repeat(${redemptionHeatmapData.merchants.length}, minmax(0, 1fr))`,
                                }}
                              >
                                <div className="heatmap-grid__corner">
                                  Monto
                                </div>
                                {redemptionHeatmapData.merchants.map(
                                  (merchant) => (
                                    <div
                                      key={`redemption-merchant-${merchant}`}
                                      className="heatmap-grid__header"
                                    >
                                      {merchant}
                                    </div>
                                  ),
                                )}
                                {redemptionHeatmapData.amounts.map((amount) => (
                                  <Fragment key={`redemption-row-${amount}`}>
                                    <div className="heatmap-grid__row-label">
                                      {formatValue(amount, "currency")}
                                    </div>
                                    {redemptionHeatmapData.merchants.map(
                                      (merchant) => {
                                        const key = `${merchant}|${amount}`;
                                        const metrics =
                                          redemptionHeatmapData.valueMap.get(
                                            key,
                                          ) ?? {
                                            redemptions: 0,
                                            totalValue: 0,
                                          };
                                        const background = getHeatmapColor(
                                          metrics.redemptions,
                                          redemptionHeatmapData.maxValue,
                                          redemptionHeatmapData.minPositiveValue,
                                        );
                                        const textColor =
                                          metrics.redemptions > 0 &&
                                          redemptionHeatmapData.maxValue > 0
                                            ? metrics.redemptions /
                                                redemptionHeatmapData.maxValue >
                                              0.55
                                              ? "#ffffff"
                                              : "#111111"
                                            : "#666666";
                                        return (
                                          <Tooltip
                                            key={`redemption-cell-${key}`}
                                            title={`${merchant} · ${formatValue(
                                              amount,
                                              "currency",
                                            )}: ${formatNumber(
                                              metrics.redemptions,
                                            )} redenciones`}
                                          >
                                            <div
                                              className="heatmap-grid__cell"
                                              style={{
                                                backgroundColor: background,
                                                color: textColor,
                                              }}
                                            >
                                              {metrics.redemptions > 0
                                                ? formatNumber(
                                                    metrics.redemptions,
                                                  )
                                                : ""}
                                            </div>
                                          </Tooltip>
                                        );
                                      },
                                    )}
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="activity-empty">
                              <Empty description="Aún no hay suficientes combinaciones de montos y comercios para el heatmap." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              Comercios y valor redimido
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Totales de redenciones y valor económico por
                            comercio aplicando los filtros actuales.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasRedemptionTableData ? (
                            <Table
                              columns={redemptionTableColumns}
                              dataSource={redemptionTableData}
                              pagination={false}
                              size="small"
                              scroll={{ y: 260 }}
                            />
                          ) : (
                            <div className="activity-empty">
                              <Empty description="No se encontraron comercios para mostrar en la tabla." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>
                </Space>
              ) : (
                <Card>
                  <Empty description="No hay datos de redenciones para los filtros seleccionados." />
                </Card>
              )}
            </Spin>
          )}
        </Space>
      );
    }
    if (selectedMenu === "login-security") {
      return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {selectedCampaign === "all" ? (
            <Card>
              <Empty description="Selecciona una campaña puntual para analizar logins y seguridad." />
            </Card>
          ) : loginSecurityError ? (
            <Alert type="error" message={loginSecurityError} showIcon />
          ) : (
            <Spin spinning={loadingLoginSecurity}>
              {loginSecurity ? (
                <Space
                  direction="vertical"
                  size="large"
                  style={{ width: "100%" }}
                >
                  {(loginSecurityNotes.length > 0 || loginSecurityDebug) && (
                    <Alert
                      type="info"
                      showIcon
                      message="Observaciones de la fuente"
                      description={
                        <Space direction="vertical" size="small">
                          {loginSecurityNotes.map((note: string) => (
                            <Text key={note}>{note}</Text>
                          ))}
                          {loginSecurityDebug && (
                            <Text type="secondary">
                              Debug · loginsByIpRows:{" "}
                              {formatNumber(loginSecurityDebug.loginsByIpRows)}{" "}
                              · redemptionsByIpRows:{" "}
                              {formatNumber(
                                loginSecurityDebug.redemptionsByIpRows,
                              )}{" "}
                              · loginDetailsRows:{" "}
                              {formatNumber(
                                loginSecurityDebug.loginDetailsRows,
                              )}{" "}
                              · redemptionDetailsRows:{" "}
                              {formatNumber(
                                loginSecurityDebug.redemptionDetailsRows,
                              )}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  )}
                  <Row gutter={[24, 32]} align="stretch">
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              IPs con más logins
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Top 15 direcciones IP con mayor volumen de logins
                            registrados en la campaña seleccionada.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasTopLoginIps ? (
                            <div className="activity-chart activity-chart--wide">
                              <ResponsiveContainer width="100%" height={360}>
                                <ReBarChart
                                  data={loginSecurityTopLoginData}
                                  layout="vertical"
                                  margin={{
                                    top: 16,
                                    right: 32,
                                    left: 32,
                                    bottom: 16,
                                  }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    horizontal
                                    vertical={false}
                                  />
                                  <XAxis
                                    type="number"
                                    tickFormatter={(value: number) =>
                                      formatNumber(value)
                                    }
                                  />
                                  <YAxis
                                    type="category"
                                    dataKey="ipLabel"
                                    width={180}
                                    tick={{ fontSize: 12 }}
                                  />
                                  <RechartsTooltip
                                    formatter={(rawValue: number | string) => {
                                      const numeric =
                                        typeof rawValue === "number"
                                          ? rawValue
                                          : Number(rawValue);
                                      const safeValue = Number.isFinite(numeric)
                                        ? numeric
                                        : 0;
                                      return [
                                        formatNumber(safeValue),
                                        "Logins",
                                      ];
                                    }}
                                    labelFormatter={(
                                      label: string,
                                      payload,
                                    ) => {
                                      const firstPayload =
                                        payload?.[0]?.payload ?? {};
                                      const shareValue =
                                        typeof firstPayload.share === "number"
                                          ? firstPayload.share
                                          : null;
                                      const uniqueUsers =
                                        typeof firstPayload.uniqueUsers ===
                                        "number"
                                          ? firstPayload.uniqueUsers
                                          : 0;
                                      const shareText =
                                        shareValue !== null && shareValue > 0
                                          ? ` · ${formatPercentage(shareValue)}`
                                          : "";
                                      return `${label}${shareText} · ${formatNumber(
                                        uniqueUsers,
                                      )} usuarios`;
                                    }}
                                  />
                                  <Bar
                                    dataKey="totalLogins"
                                    name="Logins"
                                    fill="#eb001b"
                                    radius={[0, 8, 8, 0]}
                                  />
                                </ReBarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="activity-empty">
                              <Empty description="No hay IPs con logins para mostrar." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                    <Col xs={24} xl={12}>
                      <Card className="activity-card">
                        <div className="activity-heading">
                          <div className="activity-header">
                            <Title level={4} className="activity-title">
                              IPs con más redenciones
                            </Title>
                            <div className="activity-separator" />
                          </div>
                          <Text type="secondary" className="activity-subtitle">
                            Top 15 direcciones IP con mayor cantidad de
                            redenciones acumuladas.
                          </Text>
                        </div>
                        <div className="activity-body">
                          {hasTopRedemptionIps ? (
                            <div className="activity-chart activity-chart--wide">
                              <ResponsiveContainer width="100%" height={360}>
                                <ReBarChart
                                  data={loginSecurityTopRedemptionData}
                                  layout="vertical"
                                  margin={{
                                    top: 16,
                                    right: 32,
                                    left: 32,
                                    bottom: 16,
                                  }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    horizontal
                                    vertical={false}
                                  />
                                  <XAxis
                                    type="number"
                                    tickFormatter={(value: number) =>
                                      formatNumber(value)
                                    }
                                  />
                                  <YAxis
                                    type="category"
                                    dataKey="ipLabel"
                                    width={180}
                                    tick={{ fontSize: 12 }}
                                  />
                                  <RechartsTooltip
                                    formatter={(rawValue: number | string) => {
                                      const numeric =
                                        typeof rawValue === "number"
                                          ? rawValue
                                          : Number(rawValue);
                                      const safeValue = Number.isFinite(numeric)
                                        ? numeric
                                        : 0;
                                      return [
                                        formatNumber(safeValue),
                                        "Redenciones",
                                      ];
                                    }}
                                    labelFormatter={(
                                      label: string,
                                      payload,
                                    ) => {
                                      const firstPayload =
                                        payload?.[0]?.payload ?? {};
                                      const redeemedValue =
                                        typeof firstPayload.redeemedValue ===
                                        "number"
                                          ? firstPayload.redeemedValue
                                          : 0;
                                      const uniqueRedeemers =
                                        typeof firstPayload.uniqueRedeemers ===
                                        "number"
                                          ? firstPayload.uniqueRedeemers
                                          : 0;
                                      return `${label} · ${formatValue(
                                        redeemedValue,
                                        "currency",
                                      )} · ${formatNumber(uniqueRedeemers)} usuarios`;
                                    }}
                                  />
                                  <Bar
                                    dataKey="totalRedemptions"
                                    name="Redenciones"
                                    fill="#f79e1b"
                                    radius={[0, 8, 8, 0]}
                                  />
                                </ReBarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="activity-empty">
                              <Empty description="No hay IPs con redenciones para mostrar." />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card className="activity-card">
                    <div className="activity-heading">
                      <div className="activity-header">
                        <Title level={4} className="activity-title">
                          Logins por IP e idmask
                        </Title>
                        <div className="activity-separator" />
                      </div>
                      <Text type="secondary" className="activity-subtitle">
                        Detalle de logins y redenciones por combinación IP ·
                        idmask respetando los filtros aplicados.
                      </Text>
                    </div>
                    <div className="activity-body">
                      <Table<LoginSecurityDetailRow>
                        columns={loginSecurityDetailColumns}
                        dataSource={loginSecurityDetailRows}
                        rowKey="key"
                        size="small"
                        pagination={{
                          pageSize: 10,
                          hideOnSinglePage: true,
                        }}
                        scroll={{ x: 1200 }}
                        locale={{
                          emptyText: (
                            <Empty description="No se encontraron combinaciones de IP e idmask para mostrar." />
                          ),
                        }}
                      />
                    </div>
                  </Card>

                  <Card className="activity-card">
                    <div className="activity-heading">
                      <div className="activity-header">
                        <Title level={4} className="activity-title">
                          IPs atípicas detectadas
                        </Title>
                        <div className="activity-separator" />
                      </div>
                      <Text type="secondary" className="activity-subtitle">
                        Heurísticas de riesgo basadas en concentración de
                        redenciones, rapidez de canje y conversión
                        login→redención.
                      </Text>
                    </div>
                    <div className="activity-body">
                      <Table<LoginSecurityAtypicalIp>
                        columns={loginSecurityAtypicalColumns}
                        dataSource={loginSecurityAtypicalRows}
                        rowKey="ip"
                        size="small"
                        pagination={{
                          pageSize: 8,
                          hideOnSinglePage: true,
                        }}
                        scroll={{ x: 1200 }}
                        locale={{
                          emptyText: (
                            <Empty description="No se detectaron IPs atípicas con los filtros actuales." />
                          ),
                        }}
                      />
                    </div>
                  </Card>

                  <Card className="activity-card">
                    <div className="activity-heading">
                      <div className="activity-header">
                        <Title level={4} className="activity-title">
                          Adopción de doble factor (2FA)
                        </Title>
                        <div className="activity-separator" />
                      </div>
                      <Text type="secondary" className="activity-subtitle">
                        Porcentaje de usuarios con doble factor activo por segmento y semana considerando los filtros aplicados.
                      </Text>
                    </div>
                    <div className="activity-body">
                      {hasTwoFactorHeatmap ? (
                        <div className="activity-chart activity-chart--heatmap">
                          <div
                            className="heatmap-grid"
                            style={{
                              gridTemplateColumns: `160px repeat(${twoFactorHeatmapData.weeks.length}, minmax(0, 1fr))`,
                            }}
                          >
                            <div className="heatmap-grid__corner">Segmento</div>
                            {twoFactorHeatmapData.weeks.map((week) => (
                              <Tooltip
                                key={`twofactor-week-${week.value}`}
                                title={`Semana ${week.tooltip}`}
                              >
                                <div className="heatmap-grid__header">
                                  {week.label}
                                </div>
                              </Tooltip>
                            ))}
                            {twoFactorHeatmapData.segments.map((segment) => (
                              <Fragment
                                key={`twofactor-row-${segment.value}`}
                              >
                                <div className="heatmap-grid__row-label">
                                  {segment.label}
                                </div>
                                {twoFactorHeatmapData.weeks.map((week) => {
                                  const cellKey = `${segment.value}|${week.value}`;
                                  const metrics =
                                    twoFactorHeatmapData.valueMap.get(cellKey) ??
                                    {
                                      rate: 0,
                                      usersWithTwoFactor: 0,
                                      totalUsers: 0,
                                    };
                                  const colorMax =
                                    twoFactorHeatmapData.maxRate > 0
                                      ? twoFactorHeatmapData.maxRate
                                      : 1;
                                  const background = getHeatmapColor(
                                    metrics.rate,
                                    colorMax,
                                    0,
                                  );
                                  const hasUsers = metrics.totalUsers > 0;
                                  const tooltipLabel = `${segment.label} · ${week.tooltip}`;
                                  const percentageText = hasUsers
                                    ? formatPercentage(metrics.rate, 1)
                                    : "0.0%";
                                  const textColor =
                                    metrics.rate >= 0.5 ? "#ffffff" : "#111111";
                                  return (
                                    <Tooltip
                                      key={`twofactor-cell-${cellKey}`}
                                      title={`${tooltipLabel}: ${percentageText} · ${formatNumber(
                                        metrics.usersWithTwoFactor,
                                      )}/${formatNumber(
                                        metrics.totalUsers,
                                      )} usuarios con 2FA`}
                                    >
                                      <div
                                        className="heatmap-grid__cell"
                                        style={{
                                          backgroundColor: background,
                                          color: hasUsers ? textColor : "#666666",
                                        }}
                                      >
                                        {hasUsers ? percentageText : ""}
                                      </div>
                                    </Tooltip>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </div>
                          <div
                            style={{
                              marginTop: 16,
                              display: "flex",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <Text type="secondary">
                              Usuarios analizados:{" "}
                              {formatNumber(twoFactorHeatmapData.totals.totalUsers)} · Con 2FA:{" "}
                              {formatNumber(
                                twoFactorHeatmapData.totals.usersWithTwoFactor,
                              )}
                              {twoFactorHeatmapData.totals.overallRate !== null
                                ? ` · Adopción: ${formatPercentage(
                                    twoFactorHeatmapData.totals.overallRate,
                                  )}`
                                : ""}
                            </Text>
                            {typeof twoFactorHeatmapData.targetRate === "number" && (
                              <Tag color="blue">
                                Meta: {formatPercentage(twoFactorHeatmapData.targetRate, 0)}
                              </Tag>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="activity-empty">
                          <Empty description="No fue posible calcular la adopción de 2FA con los filtros actuales." />
                        </div>
                      )}
                    </div>
                  </Card>

                  {loginSecurity.metadata && (
                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <Text type="secondary">
                        Fuentes: {loginSecurity.metadata.sources.logins} ·{" "}
                        {loginSecurity.metadata.sources.redemptions}. Última
                        generación:{" "}
                        {formatDateTime(loginSecurity.metadata.generatedAt)}.
                      </Text>
                    </div>
                  )}
                </Space>
              ) : (
                <Card>
                  <Empty description="No hay datos de logins y seguridad para los filtros seleccionados." />
                </Card>
              )}
            </Spin>
          )}
        </Space>
      );
    }
    if (selectedMenu === "user-management") {
      return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {usersError && <Alert type="error" showIcon message={usersError} />}
          <Card className="activity-card">
            <div className="activity-heading">
              <div className="activity-header">
                <Title level={4} className="activity-title">
                  Usuarios con acceso
                </Title>
                <div className="activity-separator" />
              </div>
              <Text type="secondary" className="activity-subtitle">
                Administra quién puede ingresar al dashboard.
              </Text>
            </div>
            <div className="activity-body">
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenCreateUser}
                >
                  Nuevo usuario
                </Button>
              </div>
              <Table<DashboardUser>
                columns={userColumns}
                dataSource={userTableData}
                loading={loadingUsers}
                pagination={{ pageSize: 8, hideOnSinglePage: true }}
                style={{ marginTop: 16 }}
                locale={{
                  emptyText: usersError
                    ? "No se pudieron cargar los usuarios."
                    : "Aún no hay usuarios registrados.",
                }}
              />
            </div>
          </Card>
        </Space>
      );
    }
    return null;
  })();

  return (
    <Layout className="dashboard-layout">
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
        breakpoint="lg"
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
          <div className="dashboard-sider__collapse">
            <button
              type="button"
              className="collapse-trigger collapse-trigger--sider"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
          </div>
        </div>
      </Sider>
      <Layout>
        <Header className="dashboard-header">
          <Title level={3} style={{ margin: 0 }}>
            {pageTitle}
          </Title>
          <Space align="center" size="large">
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
                  style={{ backgroundColor: "#f79e1b", color: "#111111", fontWeight: 600 }}
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
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {selectedMenu !== "user-management" && (
              <Card className="filter-card">
                <Space
                  direction="vertical"
                  size="large"
                  style={{ width: "100%" }}
                >
                  <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary">Campaña</Text>
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
                        />
                      </Space>
                    </Col>
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary">Tipo de login</Text>
                        <Select
                          allowClear
                          placeholder="Selecciona un tipo"
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
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary">Rango de fechas</Text>
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
                  </Row>
                  <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary">Id de usuario</Text>
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
                    <Col xs={24} md={12} lg={8}>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: "100%" }}
                      >
                        <Text type="secondary">IP</Text>
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
                    <Col
                      xs={24}
                      md={12}
                      lg={8}
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-end",
                      }}
                    >
                      <Button
                        onClick={handleResetFilters}
                        disabled={!filtersAreActive}
                      >
                        Borrar filtros
                      </Button>
                    </Col>
                  </Row>
                </Space>
              </Card>
            )}

            {error && <Alert type="error" message={error} showIcon />}

            <Spin spinning={loadingSummary}>
              {summary ? (
                <Card className="kpi-wrapper">
                  <Space
                    direction="vertical"
                    size="middle"
                    style={{ width: "100%" }}
                  >
                    <div className="kpi-header">
                      <Title level={4} className="kpi-title">
                        Indicadores generales
                      </Title>
                      <div className="kpi-separator" />
                    </div>
                    <Row gutter={[16, 16]} wrap={false} className="kpi-row">
                      {KPI_DEFINITIONS.map((definition) => {
                        const metricValue = metricsByKey.get(
                          definition.key,
                        )?.value;
                        return (
                          <Col
                            key={definition.key}
                            className="kpi-col"
                            flex="1 1 0"
                          >
                            <Card className="kpi-card">
                              <Statistic
                                title={definition.label}
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
                  </Space>
                </Card>
              ) : (
                !loadingSummary && (
                  <Card>
                    <Empty description="Selecciona una campaña para visualizar los KPIs." />
                  </Card>
                )
              )}
            </Spin>

            {mainSection}

            <Modal
              title="Mi perfil"
              open={profileModalVisible}
              onCancel={mustChangePassword ? undefined : handleCloseProfileModal}
              onOk={handleSubmitProfile}
              confirmLoading={profileSubmitting}
              destroyOnClose
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
                destroyOnClose
                maskClosable={false}
                okText={isEditingUser ? "Guardar cambios" : "Crear usuario"}
                cancelText="Cancelar"
              >
                <Form<UserFormValues>
                  layout="vertical"
                  form={userForm}
                  preserve={false}
                >
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
                      autoComplete={
                        isEditingUser ? "new-password" : "new-password"
                      }
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
                      const requireReset =
                        userForm.getFieldValue("forcePasswordReset");
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
            {selectedMenu === "overview" && (
              <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <Row gutter={[24, 32]} align="stretch">
                <Col xs={24} xl={12} className="activity-col">
                  <Card className="activity-card">
                    <div className="activity-heading">
                      <div className="activity-header">
                        <Title level={4} className="activity-title">
                          Logins por tipo
                        </Title>
                        <div className="activity-separator" />
                      </div>
                      <Text type="secondary" className="activity-subtitle">
                        Total de logins agrupados por tipo aplicando los filtros
                        actuales.
                      </Text>
                    </div>

                    <div className="activity-body">
                      <Spin spinning={loadingActivity}>
                        {hasLoginTypeDistribution ? (
                          <div className="activity-chart activity-chart--wide">
                            <ResponsiveContainer width="100%" height={460}>
                              <ReBarChart
                                data={loginTypeDistribution}
                                margin={{
                                  top: 24,
                                  right: 32,
                                  left: 32,
                                  bottom: 60,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey="typeLabel"
                                  interval={0}
                                  tick={{ fontSize: 12 }}
                                  angle={-20}
                                  textAnchor="end"
                                  height={80}
                                  tickMargin={12}
                                  label={{
                                    value: "Tipo de login",
                                    position: "insideBottom",
                                    offset: -12,
                                    style: { textAnchor: "middle" },
                                  }}
                                />
                                <YAxis
                                  tickFormatter={(value: number) =>
                                    formatNumber(value)
                                  }
                                  tick={{ fontSize: 12 }}
                                  label={{
                                    value: "Logins",
                                    angle: -90,
                                    position: "insideLeft",
                                    offset: -12,
                                    style: { textAnchor: "middle" },
                                  }}
                                />
                                <RechartsTooltip
                                  formatter={(value: number | string) => {
                                    const numericValue =
                                      typeof value === "number"
                                        ? value
                                        : Number(value);
                                    const safeValue = Number.isFinite(
                                      numericValue,
                                    )
                                      ? numericValue
                                      : 0;
                                    return [formatNumber(safeValue), "Logins"];
                                  }}
                                  labelFormatter={(label: string) => label}
                                />
                                <Bar
                                  dataKey="logins"
                                  name="Logins"
                                  fill="#eb001b"
                                  radius={[4, 4, 0, 0]}
                                  isAnimationActive={false}
                                />
                              </ReBarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          !loadingActivity && (
                            <div className="activity-empty">
                              <Empty description="No hay logins registrados para los filtros seleccionados." />
                            </div>
                          )
                        )}
                      </Spin>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} xl={12} className="activity-col">
                  <Card className="activity-card">
                    <div className="activity-heading">
                      <div className="activity-header">
                        <Title level={4} className="activity-title">
                          Heatmap día-hora de logins
                        </Title>
                        <div className="activity-separator" />
                      </div>
                      <Text type="secondary" className="activity-subtitle">
                        Intensidad de logins según día de la semana y bloques de
                        dos horas.
                      </Text>
                    </div>

                    <div className="activity-body">
                      <Spin spinning={loadingActivity}>
                        {hasHeatmapData ? (
                          <div
                            className="activity-chart activity-chart--heatmap"
                            style={{ minHeight: 0 }}
                          >
                            <div
                              className="heatmap-grid"
                              style={{
                                gridTemplateColumns: `100px repeat(${loginHeatmapData.dayHeaders.length}, minmax(0, 1fr))`,
                              }}
                            >
                              <div className="heatmap-grid__corner">Bloque</div>
                              {loginHeatmapData.dayHeaders.map((header) => (
                                <Tooltip
                                  key={`heatmap-header-${header.value}`}
                                  title={header.fullLabel}
                                >
                                  <div className="heatmap-grid__header">
                                    {header.label}
                                  </div>
                                </Tooltip>
                              ))}
                              {loginHeatmapData.hourBuckets.map((bucket) => (
                                <Fragment key={`heatmap-row-${bucket}`}>
                                  <div className="heatmap-grid__row-label">
                                    {formatHourLabel(bucket)}
                                  </div>
                                  {loginHeatmapData.dayHeaders.map((header) => {
                                    const key = `${header.value}|${bucket}`;
                                    const logins =
                                      loginHeatmapData.valueMap.get(key) ?? 0;
                                    const background = getHeatmapColor(
                                      logins,
                                      loginHeatmapData.maxValue,
                                      loginHeatmapData.minValue,
                                    );
                                    const textColor =
                                      logins > 0 &&
                                      loginHeatmapData.maxValue > 0
                                        ? logins / loginHeatmapData.maxValue >
                                          0.55
                                          ? "#ffffff"
                                          : "#111111"
                                        : "#666666";
                                    const tooltipLabel = `${header.fullLabel} · ${formatHourLabel(
                                      bucket,
                                    )}`;
                                    return (
                                      <Tooltip
                                        key={`heatmap-cell-${key}`}
                                        title={`${tooltipLabel}: ${formatNumber(logins)} logins`}
                                      >
                                        <div
                                          className="heatmap-grid__cell"
                                          style={{
                                            backgroundColor: background,
                                            color: textColor,
                                          }}
                                        >
                                          {logins > 0
                                            ? formatNumber(logins)
                                            : ""}
                                        </div>
                                      </Tooltip>
                                    );
                                  })}
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ) : (
                          !loadingActivity && (
                            <div className="activity-empty">
                              <Empty description="No hay registros de logins para construir el heatmap." />
                            </div>
                          )
                        )}
                      </Spin>
                    </div>
                  </Card>
                </Col>
              </Row>

              <Card className="activity-card">
                <div className="activity-heading">
                  <div className="activity-header">
                    <Title level={4} className="activity-title">
                      Redenciones por segmento
                    </Title>
                    <div className="activity-separator" />
                  </div>
                  <Text type="secondary" className="activity-subtitle">
                    Usuarios con redención, número de redenciones y valor redimido agrupados por segmento.
                  </Text>
                </div>
                <div className="activity-body">
                  <Spin spinning={loadingSummary}>
                    {hasSegmentRedemptionData ? (
                      <div className="activity-chart activity-chart--wide">
                        <ResponsiveContainer width="100%" height={420}>
                          <ReComposedChart
                            data={segmentRedemptionChartData}
                            margin={{
                              top: 24,
                              right: 48,
                              left: 48,
                              bottom: 48,
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="segment"
                              interval={0}
                              tick={{ fontSize: 12 }}
                              angle={
                                segmentRedemptionChartData.length > 5 ? -20 : 0
                              }
                              textAnchor={
                                segmentRedemptionChartData.length > 5
                                  ? "end"
                                  : "middle"
                              }
                              height={segmentRedemptionChartData.length > 5 ? 80 : 50}
                              tickMargin={12}
                              label={{
                                value: "Segmento",
                                position: "insideBottom",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="counts"
                              domain={[0, segmentRedemptionAxisExtents.counts]}
                              tickFormatter={(value: number) =>
                                formatNumber(value)
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Usuarios / Redenciones",
                                angle: -90,
                                position: "insideLeft",
                                offset: -12,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <YAxis
                              yAxisId="value"
                              orientation="right"
                              domain={[0, segmentRedemptionAxisExtents.value]}
                              tickFormatter={(value: number) =>
                                formatValue(value, "currency")
                              }
                              tick={{ fontSize: 12 }}
                              label={{
                                value: "Valor redimido (COP)",
                                angle: -90,
                                position: "insideRight",
                                offset: -8,
                                style: { textAnchor: "middle" },
                              }}
                            />
                            <RechartsTooltip
                              formatter={(
                                rawValue: number | string,
                                name: string,
                              ) => {
                                const numeric =
                                  typeof rawValue === "number"
                                    ? rawValue
                                    : Number(rawValue);
                                const safeValue = Number.isFinite(numeric)
                                  ? numeric
                                  : 0;
                                if (name === "Valor redimido (COP)") {
                                  return [formatValue(safeValue, "currency"), name];
                                }
                                return [formatNumber(safeValue), name];
                              }}
                              labelFormatter={(label: string, payload) => {
                                const firstEntry = payload?.[0]?.payload as
                                  | SegmentRedemptionBreakdownEntry
                                  | undefined;
                                const average =
                                  firstEntry &&
                                  typeof firstEntry.averageTicket === "number"
                                    ? formatValue(firstEntry.averageTicket, "currency")
                                    : "N/D";
                                return `${label} · Ticket promedio: ${average}`;
                              }}
                            />
                            <RechartsLegend
                              verticalAlign="top"
                              align="center"
                              wrapperStyle={{ paddingBottom: 16 }}
                            />
                            <Bar
                              yAxisId="counts"
                              dataKey="uniqueRedeemers"
                              name="Usuarios con redención"
                              fill="#eb001b"
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={false}
                            />
                            <Bar
                              yAxisId="counts"
                              dataKey="totalRedemptions"
                              name="Redenciones totales"
                              fill="#f79e1b"
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={false}
                            />
                            <Line
                              yAxisId="value"
                              type="monotone"
                              dataKey="redeemedValue"
                              name="Valor redimido (COP)"
                              stroke="#003087"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                          </ReComposedChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      !loadingSummary && (
                        <div className="activity-empty">
                          <Empty description="No hay redenciones suficientes para mostrar por segmento." />
                        </div>
                      )
                    )}
                  </Spin>
                </div>
              </Card>
            </Space>
            )}
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard;
