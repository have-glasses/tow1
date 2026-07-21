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

function queryString(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([left], [right]) => left.toLowerCase().localeCompare(right.toLowerCase()))
    .map(([key, value]) => `${encode(key.toLowerCase())}=${encode(value)}`)
    .join("&");
}

function requestQueryString(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => value === "" ? encode(key) : `${encode(key)}=${encode(value)}`)
    .join("&");
}

function signedUrl(method: "delete" | "get" | "head" | "post" | "put", key: string, lifetimeSeconds: number, params: Record<string, string> = {}) {
  const value = config();
  const host = `${value.bucket}.cos.${value.region}.myqcloud.com`;
  const canonicalPath = `/${key}`;
  const requestPath = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + lifetimeSeconds}`;
  const headerList = "host";
  const paramList = Object.keys(params).map((key) => key.toLowerCase()).sort().join(";");
  const httpString = `${method}\n${canonicalPath}\n${queryString(params)}\nhost=${encode(host)}\n`;
  const signKey = hmac(value.secretKey, keyTime);
  const signature = hmac(signKey, `sha1\n${keyTime}\n${sha1(httpString)}\n`);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${encode(value.secretId)}`,
    `q-sign-time=${encode(keyTime)}`,
    `q-key-time=${encode(keyTime)}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${encode(paramList)}`,
    `q-signature=${signature}`
  ].join("&");
  const requestQuery = requestQueryString(params);
  return `https://${host}${requestPath}?${requestQuery ? `${requestQuery}&` : ""}${authorization}`;
}

export function createStorageKey(itemId: string) {
  const value = config();
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  return `${value.prefix}${date}/${itemId}`;
}

export function createFolderCoverKey(folderId: string) {
  return `${config().prefix}covers/${folderId}`;
}

export function createUploadUrl(key: string) { return signedUrl("put", key, 15 * 60); }
export function createHeadUrl(key: string) { return signedUrl("head", key, 5 * 60); }
export function createDownloadUrl(key: string) { return signedUrl("get", key, 5 * 60); }
export function createDeleteUrl(key: string) { return signedUrl("delete", key, 5 * 60); }
export function createMultipartPartUrl(key: string, uploadId: string, partNumber: number) {
  return signedUrl("put", key, 30 * 60, { partNumber: String(partNumber), uploadId });
}

function xmlText(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] || "";
}

export async function createMultipartUpload(key: string, mimeType: string) {
  const response = await fetch(signedUrl("post", key, 5 * 60, { uploads: "" }), {
    method: "POST",
    headers: { "Content-Type": mimeType || "application/octet-stream" }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`COS multipart init failed: ${response.status} ${body}`);
  const uploadId = xmlText(body, "UploadId");
  if (!uploadId) throw new Error("COS multipart init did not return UploadId");
  return uploadId;
}

export type MultipartPart = { partNumber: number; etag: string; size: number };

export async function listMultipartParts(key: string, uploadId: string) {
  const response = await fetch(signedUrl("get", key, 5 * 60, { uploadId, "max-parts": "1000" }), { cache: "no-store" });
  const body = await response.text();
  if (!response.ok) throw new Error(`COS list parts failed: ${response.status} ${body}`);
  const parts: MultipartPart[] = [];
  for (const match of body.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    const part = match[1];
    const partNumber = Number(xmlText(part, "PartNumber"));
    const etag = xmlText(part, "ETag").replace(/^"|"$/g, "");
    const size = Number(xmlText(part, "Size"));
    if (Number.isFinite(partNumber) && partNumber > 0 && etag) parts.push({ partNumber, etag, size: Number.isFinite(size) ? size : 0 });
  }
  return parts.sort((left, right) => left.partNumber - right.partNumber);
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]) {
  const body = `<CompleteMultipartUpload>${parts.map((part) =>
    `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`
  ).join("")}</CompleteMultipartUpload>`;
  const response = await fetch(signedUrl("post", key, 30 * 60, { uploadId }), {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body
  });
  const responseBody = await response.text();
  if (!response.ok || /<Error>/.test(responseBody)) throw new Error(`COS multipart complete failed: ${response.status} ${responseBody}`);
}
