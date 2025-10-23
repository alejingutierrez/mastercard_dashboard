import {
  Alert,
  Button,
  Card,
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
}: UserManagementSectionProps) => (
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
          <Button type="primary" onClick={onCreateUser}>
            Nuevo usuario
          </Button>
        </div>
        <Table<DashboardUser>
          columns={columns}
          dataSource={dataSource}
          loading={loading}
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

export default UserManagementSection;
