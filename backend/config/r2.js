const { S3Client } =
  require("@aws-sdk/client-s3");

module.exports = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,

  credentials: {
    accessKeyId:
      process.env.R2_ACCESS_KEY_ID,

    secretAccessKey:
      process.env.R2_SECRET_ACCESS_KEY,
  },
});