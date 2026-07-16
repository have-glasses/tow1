import crypto from "node:crypto";

type CosConfig = { secretId: string; secretKey: string; bucket: string; region: string; prefix: string };

function config(): CosConfig {
  const secretId = process.env.DRIVE_COS_SECRET_ID || process.env.COS_SECRET_ID;
  const secretKey = process.env.DRIVE_COS_SECRET_KEY || process.env.COS_SECRET_KEY;
  const bucket = process.env.DRIVE_COS_BUCKET || process.env.COS_BUCKET;
  const region = process.env.DRIVE_COS_REGION || process.env.COS_REGION || "ap-hongkong";
  const rawPrefix = process.env.DRIVE_COS_PREFIX || "tow1/files/";
  const prefix = rawPrefix.replace(/^\/+/, "").replace(/\/*$/, "/");
  if (!secretId || !secretKey || !bucket) throw new Error("网盘 COS 配置不完整");
  return { secretId, secretKey, bucket, region, prefix };
}

function sha1(value: string) { return crypto.createHash("sha1").update(value).digest("hex"); }
function hmac(key: string, value: string) { return crypto.createHmac("sha1", key).update(value).digest("hex"); }
function encode(value: string) { return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); }

function signedUrl(method: "delete" | "get" | "head" | "put", key: string, lifetimeSeconds: number) {
  const value = config();
  const host = `${value.bucket}.cos.${value.region}.myqcloud.com`;
  const canonicalPath = `/${key}`;
  const requestPath = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + lifetimeSeconds}`;
  const headerList = "host";
  const httpString = `${method}\n${canonicalPath}\n\nhost=${encode(host)}\n`;
  const signKey = hmac(value.secretKey, keyTime);
  const signature = hmac(signKey, `sha1\n${keyTime}\n${sha1(httpString)}\n`);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${encode(value.secretId)}`,
    `q-sign-time=${encode(keyTime)}`,
    `q-key-time=${encode(keyTime)}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`
  ].join("&");
  return `https://${host}${requestPath}?${authorization}`;
}

export function createStorageKey(itemId: string) {
  const value = config();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  return `${value.prefix}${date}/${itemId}`;
}

export function createUploadUrl(key: string) { return signedUrl("put", key, 15 * 60); }
export function createHeadUrl(key: string) { return signedUrl("head", key, 5 * 60); }
export function createDownloadUrl(key: string) { return signedUrl("get", key, 5 * 60); }
export function createDeleteUrl(key: string) { return signedUrl("delete", key, 5 * 60); }
