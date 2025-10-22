const { LambdaClient } = require("@aws-sdk/client-lambda");

const region = process.env.AWS_REGION || "us-west-2";

const lambdaClient = new LambdaClient({
  region,
});

module.exports = {
  lambdaClient,
};
