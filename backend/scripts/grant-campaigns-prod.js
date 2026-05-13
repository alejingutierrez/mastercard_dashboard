// Agrega nuevas campañas al usuario admin en S3 (prod) y reinicia ECS.
// Uso: node scripts/grant-campaigns-prod.js
//
// Edita NEW_CAMPAIGNS y TARGET_EMAILS si quieres conceder a otros usuarios.

const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { ECSClient, UpdateServiceCommand } = require("@aws-sdk/client-ecs");
require("dotenv").config();

const BUCKET = "mastercard-dashboard-userstore";
const KEY = "dashboard/users/dashboardUsers.json";

const NEW_CAMPAIGNS = ["pacifico-5s-7", "avvillas-lista-para-ganar"];
// Solo estos emails reciben las nuevas campañas. Agrega más si necesitas.
const TARGET_EMAILS = ["admin@dashboard.local"];

const REGION = process.env.AWS_REGION || "us-west-2";
const ECS_CLUSTER = "mastercard-dashboard-cluster";
const ECS_SERVICE = "mastercard-dashboard-backend-service";

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const s3 = new S3Client({ region: REGION, credentials });
const ecs = new ECSClient({ region: REGION, credentials });

(async () => {
  console.log(`Descargando s3://${BUCKET}/${KEY} ...`);
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  const body = await res.Body.transformToString();
  const users = JSON.parse(body);

  let modified = 0;
  for (const u of users) {
    if (!TARGET_EMAILS.includes(u.email)) continue;
    const ids = new Set(u.allowedCampaignIds || []);
    for (const c of NEW_CAMPAIGNS) {
      if (!ids.has(c)) {
        ids.add(c);
        modified++;
        console.log(`  + ${u.email}: agregada ${c}`);
      }
    }
    u.allowedCampaignIds = Array.from(ids);
  }

  if (modified === 0) {
    console.log("No hay cambios. Saliendo sin tocar S3 ni ECS.");
    return;
  }

  console.log(`\nSubiendo JSON con ${modified} grants nuevos a S3 ...`);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(users, null, 2),
      ContentType: "application/json",
    })
  );
  console.log("S3 actualizado.");

  console.log(`\nForzando rolling restart de ECS (${ECS_SERVICE}) ...`);
  await ecs.send(
    new UpdateServiceCommand({
      cluster: ECS_CLUSTER,
      service: ECS_SERVICE,
      forceNewDeployment: true,
    })
  );
  console.log("ECS rolling update iniciado. Espera 1–3 min y refresca el dashboard.");
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
