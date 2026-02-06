const { TextDecoder } = require("util");
const { InvokeCommand } = require("@aws-sdk/client-lambda");
const { lambdaClient } = require("./lambdaClient");

const LAMBDA_NAME = process.env.LAMBDA_FUNCTION_NAME || "mastercard-aurora-proxy";

const decoder = new TextDecoder("utf-8");

const sanitizeSql = (database, sqlTemplate) => {
  if (!database || !sqlTemplate) {
    throw new Error("Database and SQL template are required");
  }
  if (!sqlTemplate.includes("{db}")) {
    throw new Error("SQL template must include the {db} placeholder");
  }

  return sqlTemplate.replace(/\{db\}/g, database);
};

const escapePercentLiterals = (statement) => {
  let result = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < statement.length; i += 1) {
    const char = statement[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result += char;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      result += char;
      continue;
    }

    if ((inSingle || inDouble) && char === "%") {
      result += "%%";
      continue;
    }

    result += char;
  }

  return result;
};

const invokeLambda = async (payload) => {
  const command = new InvokeCommand({
    FunctionName: LAMBDA_NAME,
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(command);
  const rawPayload = response.Payload ? decoder.decode(response.Payload) : "{}";
  const parsed = JSON.parse(rawPayload || "{}");

  if (response.FunctionError) {
    throw new Error(`Lambda error: ${response.FunctionError}`);
  }

  if (parsed.status && parsed.status !== "ok") {
    const message = parsed.errorMessage || "Unknown Lambda error";
    throw new Error(`Lambda responded with error: ${message}`);
  }

  return parsed;
};

const runQuery = async (database, sqlTemplate, parameters = []) => {
  const sql = sanitizeSql(database, sqlTemplate);
  const hasParameters = parameters.length > 0;
  const payload = {
    sql: hasParameters ? escapePercentLiterals(sql) : sql,
  };

  if (hasParameters) {
    payload.parameters = parameters;
  }

  const result = await invokeLambda(payload);

  return {
    rowCount: result.rowcount || 0,
    rows: result.rows || [],
  };
};

module.exports = {
  runQuery,
};
