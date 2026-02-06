import { useEffect, useState } from "react";
import { App as AntdApp, Spin } from "antd";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import type { LoginFormValues } from "./pages/Login";
import { login as loginRequest, fetchCurrentUser } from "./api/auth";
import { clearAuthToken, setAuthToken, TOKEN_STORAGE_KEY } from "./api/client";
import { clearCampaignRequestCache } from "./api/campaigns";
import type { DashboardUser } from "./types";

const App = () => {
  const { message } = AntdApp.useApp();
  const [currentUser, setCurrentUser] = useState<DashboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }

      setAuthToken(storedToken);
      try {
        const user = await fetchCurrentUser();
        setCurrentUser(user);
        if (user.mustResetPassword) {
          message.warning(
            "Debes actualizar tu contraseña antes de continuar usando el dashboard.",
          );
        }
      } catch (error) {
        console.error("[auth] Token inválido o expirado", error);
        clearAuthToken();
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [message]);

  const handleLogin = async ({ email, password }: LoginFormValues) => {
    const { token, user } = await loginRequest({ email, password });
    setAuthToken(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setCurrentUser(user);
    clearCampaignRequestCache();
    message.success(`Bienvenido, ${user.name || user.email}`);
    if (user.mustResetPassword) {
      message.warning(
        "Debes actualizar tu contraseña antes de continuar usando el dashboard.",
      );
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    clearCampaignRequestCache();
    setCurrentUser(null);
    message.success("Sesión cerrada correctamente.");
  };

  const handleUserUpdate = (user: DashboardUser) => {
    setCurrentUser(user);
  };

  if (loading) {
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Dashboard
      currentUser={currentUser}
      onLogout={handleLogout}
      onUserUpdate={handleUserUpdate}
    />
  );
};

export default App;
