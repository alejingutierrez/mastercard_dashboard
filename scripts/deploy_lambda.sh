#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${ZIP_PATH:-$REPO_ROOT/dist/lambda_aurora_proxy.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ERROR: Package $ZIP_PATH not found. Run scripts/build_lambda_package.sh first." >&2
  exit 1
fi

: "${LAMBDA_FUNCTION_NAME:?Set LAMBDA_FUNCTION_NAME to the target function name}"
: "${LAMBDA_ROLE_ARN:?Set LAMBDA_ROLE_ARN to the IAM role ARN for the Lambda}"
: "${DB_HOST:?Set DB_HOST to the Aurora endpoint hostname}"
: "${DB_SECRET_ARN:?Set DB_SECRET_ARN to the Secrets Manager ARN with credentials}"
: "${SUBNET_IDS:?Provide comma-separated SUBNET_IDS where the Lambda will run}"
: "${SECURITY_GROUP_IDS:?Provide comma-separated SECURITY_GROUP_IDS for the Lambda VPC config}"

AWS_REGION="${AWS_REGION:-us-west-2}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-}"
SSL_CERT_PATH="${SSL_CERT_PATH:-/var/task/rds-ca-rsa2048-g1.pem}"

ENV_VARS="DB_HOST=$DB_HOST,DB_SECRET_ARN=$DB_SECRET_ARN,DB_PORT=$DB_PORT,SSL_CERT_PATH=$SSL_CERT_PATH"
if [[ -n "$DB_NAME" ]]; then
  ENV_VARS="$ENV_VARS,DB_NAME=$DB_NAME"
fi

if aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Updating existing function $LAMBDA_FUNCTION_NAME..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$AWS_REGION"

  aws lambda update-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --environment "Variables={$ENV_VARS}" \
    --timeout "${LAMBDA_TIMEOUT:-30}" \
    --memory-size "${LAMBDA_MEMORY_MB:-512}" \
    --region "$AWS_REGION"
else
  echo "Creating new function $LAMBDA_FUNCTION_NAME..."
  aws lambda create-function \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --handler lambda_function.handler \
    --runtime python3.11 \
    --timeout "${LAMBDA_TIMEOUT:-30}" \
    --memory-size "${LAMBDA_MEMORY_MB:-512}" \
    --role "$LAMBDA_ROLE_ARN" \
    --environment "Variables={$ENV_VARS}" \
    --region "$AWS_REGION" \
    --vpc-config "SubnetIds=$SUBNET_IDS,SecurityGroupIds=$SECURITY_GROUP_IDS"
fi

echo "Deployment completed."
