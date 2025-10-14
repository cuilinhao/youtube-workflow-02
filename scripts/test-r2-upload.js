/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const bucket = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const sessionToken = process.env.R2_SESSION_TOKEN;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('缺少 R2 环境变量，请确认已经加载 .env.local');
  }

  const filePath = path.join(process.cwd(), 'public', 'abc.png');
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const key = `uploads/test-${Date.now()}-abc.png`;

  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    },
  });

  console.log('[R2 TEST] 开始上传', { key, size: fileBuffer.length });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: 'image/png',
    }),
  );
  console.log('[R2 TEST] 上传成功');

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  console.log('[R2 TEST] 对象信息', {
    contentLength: head.ContentLength,
    contentType: head.ContentType,
    etag: head.ETag,
  });

  if (process.env.R2_PUBLIC_BASE_URL) {
    const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
    const publicUrl = `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
    console.log('[R2 TEST] 公共访问 URL', publicUrl);
  } else {
    console.log('[R2 TEST] 未配置 R2_PUBLIC_BASE_URL，可通过 /api/r2/presign-get 获取读取链接');
  }

  console.log('[R2 TEST] 完成');
}

main().catch((error) => {
  console.error('[R2 TEST] 失败', error);
  process.exit(1);
});
