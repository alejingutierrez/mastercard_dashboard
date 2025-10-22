import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Typography,
} from "antd";

const { Title, Text } = Typography;

export interface LoginFormValues {
  email: string;
  password: string;
}

interface LoginProps {
  onLogin: (values: LoginFormValues) => Promise<void>;
}

const Login = ({ onLogin }: LoginProps) => {
  const [form] = Form.useForm<LoginFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (values: LoginFormValues) => {
    try {
      setSubmitting(true);
      setError(undefined);
      await onLogin(values);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || "No se pudo iniciar sesión. Revisa tus credenciales.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-brand">
          <img
            src="https://logos-world.net/wp-content/uploads/2020/09/Mastercard-Logo.png"
            alt="Mastercard"
          />
        </div>
        <Card className="login-card">
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div className="login-header">
            <Title level={3} style={{ margin: 0 }}>
              Mastercard Dashboard
            </Title>
            <Text type="secondary">
              Ingresa tus credenciales para acceder al panel administrativo.
            </Text>
          </div>
          {error && <Alert type="error" showIcon message={error} />}
          <Form<LoginFormValues>
            layout="vertical"
            form={form}
            disabled={submitting}
            onFinish={handleSubmit}
            initialValues={{ email: "", password: "" }}
          >
            <Form.Item
              label="Correo electrónico"
              name="email"
              rules={[
                { required: true, message: "Ingresa tu correo electrónico" },
                { type: "email", message: "Ingresa un formato de correo válido" },
              ]}
            >
              <Input size="large" autoComplete="email" placeholder="admin@empresa.com" />
            </Form.Item>
            <Form.Item
              label="Contraseña"
              name="password"
              rules={[{ required: true, message: "Ingresa tu contraseña" }]}
            >
              <Input.Password
                size="large"
                autoComplete="current-password"
                placeholder="********"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
            >
              Ingresar
            </Button>
          </Form>
        </Space>
        </Card>
      </div>
    </div>
  );
};

export default Login;
