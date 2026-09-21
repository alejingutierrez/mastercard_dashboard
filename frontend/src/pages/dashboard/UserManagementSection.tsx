import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DashboardUser } from "../../types";

const { Title, Text } = Typography;

interface UserManagementSectionProps {
  usersError?: string;
  onCreateUser: () => void;
  loading: boolean;
  columns: ColumnsType<DashboardUser>;
  dataSource: (DashboardUser & { key: string })[];
}

const UserManagementSection = ({
  usersError,
  onCreateUser,
  loading,
  columns,
  dataSource,
}: UserManagementSectionProps) => {
  const [search, setSearch] = useState("");

  // Filtro por nombre o correo (case-insensitive, sin acentos-strict).
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dataSource;
    return dataSource.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [dataSource, search]);

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
            Administra quién puede ingresar al dashboard. Ordena por nombre
            haciendo click en la cabecera de la columna Usuario, o busca por
            nombre o correo en el input.
          </Text>
        </div>
        <div className="activity-body">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Input.Search
              allowClear
              placeholder="Buscar por nombre o correo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={setSearch}
              style={{ maxWidth: 360, minWidth: 220 }}
            />
            <Button type="primary" onClick={onCreateUser}>
              Nuevo usuario
            </Button>
          </div>
          <Table<DashboardUser>
            columns={columns}
            dataSource={filteredData}
            loading={loading}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            style={{ marginTop: 16 }}
            locale={{
              emptyText: usersError
                ? "No se pudieron cargar los usuarios."
                : search
                ? `Sin resultados para "${search}".`
                : "Aún no hay usuarios registrados.",
            }}
          />
        </div>
      </Card>
    </Space>
  );
};

export default UserManagementSection;
