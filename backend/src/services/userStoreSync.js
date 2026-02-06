const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const bucket = process.env.DASHBOARD_USERS_S3_BUCKET?.trim();
const key = process.env.DASHBOARD_USERS_S3_KEY?.trim();
const hasRemoteStore = Boolean(bucket && key);
let client;

const getClient = () => {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2",
    });
  }
  return client;
};

const fileExistsInS3 = async () => {
  if (!hasRemoteStore) {
    return false;
  }
  try {
    await getClient().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    if (
      error?.$metadata?.httpStatusCode === 404 ||
      error?.name === "NotFound" ||
      error?.name === "NoSuchKey"
    ) {
      return false;
    }
    console.warn("[userStore:s3] No se pudo verificar el archivo en S3", error);
    throw error;
  }
};

const syncUsersFromS3 = async (localPath) => {
  if (!hasRemoteStore) {
    return false;
  }
  try {
    const exists = await fileExistsInS3();
    if (!exists) {
      return false;
    }

    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (response.Body) {
      await pipeline(response.Body, fsSync.createWriteStream(localPath));
      console.info("[userStore:s3] Archivo de usuarios actualizado desde S3.");
      return true;
    }
    return false;
  } catch (error) {
    if (
      error?.$metadata?.httpStatusCode === 404 ||
      error?.name === "NotFound" ||
      error?.name === "NoSuchKey"
    ) {
      return false;
    }
    console.error("[userStore:s3] Error descargando usuarios desde S3", error);
    throw error;
  }
};

const syncUsersToS3 = async (localPath) => {
  if (!hasRemoteStore) {
    return false;
  }
  try {
    const body = await fs.readFile(localPath);
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
      })
    );
    console.info("[userStore:s3] Archivo de usuarios sincronizado hacia S3.");
    return true;
  } catch (error) {
    console.error("[userStore:s3] Error subiendo usuarios a S3", error);
    throw error;
  }
};

module.exports = {
  syncUsersFromS3,
  syncUsersToS3,
};
