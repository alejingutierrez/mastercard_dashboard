"""
AWS Lambda handler that proxies SQL queries to the Mastercard Aurora MySQL cluster.

Expected environment variables:
  DB_HOST          - Cluster endpoint hostname (e.g. mastercard-pro.cluster-....rds.amazonaws.com)
  DB_PORT          - Optional, defaults to 3306.
  DB_SECRET_ARN    - AWS Secrets Manager ARN containing {"username": "...", "password": "..."}.
  DB_NAME          - Optional default database/schema.
  SSL_CERT_PATH    - Optional absolute path to the RDS CA bundle within the Lambda deployment.

Invocation payload contract:
{
  "sql": "SELECT 1",
  "parameters": [ ... ]           # optional, passed to cursor.execute
}
"""

import base64
import json
import logging
import os
from contextlib import closing
from typing import Any, Dict, Iterable, Optional

import boto3
import pymysql


logger = logging.getLogger()
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)

_secrets_client = boto3.client("secretsmanager")


def _load_secret(secret_arn: str) -> Dict[str, Any]:
    """Retrieve and decode the credential payload from Secrets Manager or env."""
    env_user = os.environ.get("DB_USERNAME")
    env_pass = os.environ.get("DB_PASSWORD")
    if env_user and env_pass:
        logger.info("Usando credenciales proporcionadas por variables de entorno.")
        return {"username": env_user, "password": env_pass}

    response = _secrets_client.get_secret_value(SecretId=secret_arn)
    if "SecretString" in response and response["SecretString"]:
        payload = response["SecretString"]
    else:
        payload = base64.b64decode(response["SecretBinary"]).decode("utf-8")
    data = json.loads(payload)
    if "username" not in data or "password" not in data:
        raise RuntimeError("Secret payload must include 'username' and 'password'.")
    return data


def _connect() -> pymysql.connections.Connection:
    """Create a PyMySQL connection using environment configuration."""
    host = os.environ["DB_HOST"]
    port = int(os.environ.get("DB_PORT", "3306"))
    secret_arn = os.environ["DB_SECRET_ARN"]
    database = os.environ.get("DB_NAME")

    logger.info("Recuperando credenciales del secreto %s", secret_arn)
    creds = _load_secret(secret_arn)
    logger.info("Credenciales obtenidas, creando conexión a %s:%s", host, port)

    ssl_cert_path = os.environ.get("SSL_CERT_PATH")
    ssl_args = {"ca": ssl_cert_path} if ssl_cert_path else None

    return pymysql.connect(
        host=host,
        port=port,
        user=creds["username"],
        password=creds["password"],
        database=database,
        connect_timeout=10,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
        ssl=ssl_args,
    )


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """Lambda entrypoint."""
    sql: Optional[str] = event.get("sql")
    params: Optional[Iterable[Any]] = event.get("parameters")

    if not sql:
        logger.warning("Invocation sin sentencia SQL.")
        return {
            "status": "error",
            "errorType": "BadRequest",
            "errorMessage": "Payload must include a non-empty 'sql' string.",
        }

    try:
        logger.info("Ejecutando SQL: %s", sql)
        with closing(_connect()) as connection:
            with connection.cursor() as cursor:
                logger.info("Conexión establecida. Ejecutando cursor.")
                cursor.execute(sql, params)
                rowcount = cursor.rowcount
                rows = cursor.fetchall() if cursor.description else []

        return {"status": "ok", "rowcount": rowcount, "rows": rows}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Error al ejecutar la consulta.")
        return {
            "status": "error",
            "errorType": exc.__class__.__name__,
            "errorMessage": str(exc),
        }
