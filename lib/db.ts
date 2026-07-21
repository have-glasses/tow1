import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type DriveItem = {
  id: string;
  parent_id: string | null;
  kind: "file" | "folder";
  name: string;
  storage_key: string | null;
  cover_storage_key: string | null;
  mime_type: string | null;
  size_bytes: number;
  status: "uploading" | "active" | "trashed";
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

export type DriveShare = {
  id: string;
  item_id: string;
  token: string;
  password_hash: string;
  expires_at: string;
  revoked_at: string | null;
  download_count: number;
  last_accessed_at: string | null;
  created_at: string;
};

export type DriveUploadSession = {
  item_id: string;
  upload_id: string;
  part_size: number;
  file_last_modified: number | null;
  created_at: string;
  updated_at: string;
};

let client: Client | null = null;
let initialized: Promise<void> | null = null;

function getClient() {
  if (client) return client;
  const localDataDir = path.join(process.cwd(), "data");
  const remoteUrl = process.env.DRIVE_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
  if (!remoteUrl) mkdirSync(localDataDir, { recursive: true });
  const url = remoteUrl || `file:${path.join(localDataDir, "drive.sqlite")}`;
  const authToken = process.env.DRIVE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
  client = createClient({ url, authToken });
  return client;
}

async function ensureSchema() {
  if (!initialized) {
    initialized = (async () => {
      const db = getClient();
      await db.execute(`CREATE TABLE IF NOT EXISTS drive_items (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        kind TEXT NOT NULL CHECK(kind IN ('file', 'folder')),
        name TEXT NOT NULL,
        storage_key TEXT UNIQUE,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('uploading', 'active', 'trashed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        trashed_at TEXT
      )`);
      await db.execute("CREATE INDEX IF NOT EXISTS idx_drive_items_parent ON drive_items(parent_id, status, kind, name)");
      const itemColumns = await db.execute("PRAGMA table_info(drive_items)");
      if (!itemColumns.rows.some((column) => String(column.name) === "cover_storage_key")) {
        await db.execute("ALTER TABLE drive_items ADD COLUMN cover_storage_key TEXT");
      }
      await db.execute(`CREATE TABLE IF NOT EXISTS drive_shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        download_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at TEXT,
        created_at TEXT NOT NULL
      )`);
      await db.execute("CREATE INDEX IF NOT EXISTS idx_drive_shares_item ON drive_shares(item_id, revoked_at, expires_at)");
      await db.execute(`CREATE TABLE IF NOT EXISTS drive_share_attempts (
        share_id TEXT NOT NULL,
        client_key TEXT NOT NULL,
        failure_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        blocked_until TEXT,
        PRIMARY KEY (share_id, client_key)
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS drive_upload_sessions (
        item_id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        part_size INTEGER NOT NULL,
        file_last_modified INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await db.execute("CREATE INDEX IF NOT EXISTS idx_drive_upload_sessions_updated ON drive_upload_sessions(updated_at)");
      await db.execute(`WITH RECURSIVE trashed_descendants(id, trashed_at) AS (
        SELECT id, trashed_at FROM drive_items WHERE status = 'trashed'
        UNION ALL
        SELECT child.id, parent.trashed_at
        FROM drive_items child JOIN trashed_descendants parent ON child.parent_id = parent.id
        WHERE child.status = 'active'
      )
      UPDATE drive_items
      SET status = 'trashed',
          trashed_at = (SELECT tree.trashed_at FROM trashed_descendants tree WHERE tree.id = drive_items.id LIMIT 1),
          updated_at = ?
      WHERE status = 'active' AND id IN (SELECT id FROM trashed_descendants)`, [new Date().toISOString()]);
    })();
  }
  await initialized;
  return getClient();
}

function rowToItem(row: Record<string, unknown>) {
  return {
    ...row,
    size_bytes: Number(row.size_bytes)
  } as DriveItem;
}

export async function listItems(parentId: string | null, trash = false) {
  const db = await ensureSchema();
  const result = trash
    ? await db.execute({
        sql: `SELECT item.* FROM drive_items item
          LEFT JOIN drive_items parent ON parent.id = item.parent_id
          WHERE item.status = 'trashed' AND (parent.id IS NULL OR parent.status != 'trashed')
          ORDER BY item.trashed_at DESC`,
        args: []
      })
    : parentId
      ? await db.execute({ sql: "SELECT * FROM drive_items WHERE parent_id = ? AND status = 'active' ORDER BY kind DESC, name COLLATE NOCASE", args: [parentId] })
      : await db.execute({ sql: "SELECT * FROM drive_items WHERE parent_id IS NULL AND status = 'active' ORDER BY kind DESC, name COLLATE NOCASE", args: [] });
  return result.rows.map((row) => rowToItem(row as unknown as Record<string, unknown>));
}

export async function getItem(id: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_items WHERE id = ? LIMIT 1", args: [id] });
  return result.rows[0] ? rowToItem(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function listUploadingFiles(limit = 100) {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "SELECT * FROM drive_items WHERE kind = 'file' AND status = 'uploading' ORDER BY created_at DESC LIMIT ?",
    args: [limit]
  });
  return result.rows.map((row) => rowToItem(row as unknown as Record<string, unknown>));
}

export async function createFolder(id: string, name: string, parentId: string | null) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.execute({ sql: "INSERT INTO drive_items (id, parent_id, kind, name, status, created_at, updated_at) VALUES (?, ?, 'folder', ?, 'active', ?, ?)", args: [id, parentId, name, now, now] });
}

export async function reserveFile(input: { id: string; parentId: string | null; name: string; storageKey: string; mimeType: string; sizeBytes: number }) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.execute({ sql: "INSERT INTO drive_items (id, parent_id, kind, name, storage_key, mime_type, size_bytes, status, created_at, updated_at) VALUES (?, ?, 'file', ?, ?, ?, ?, 'uploading', ?, ?)", args: [input.id, input.parentId, input.name, input.storageKey, input.mimeType, input.sizeBytes, now, now] });
}

function rowToUploadSession(row: Record<string, unknown>) {
  return {
    ...row,
    part_size: Number(row.part_size),
    file_last_modified: row.file_last_modified === null ? null : Number(row.file_last_modified)
  } as DriveUploadSession;
}

export async function createUploadSession(input: { itemId: string; uploadId: string; partSize: number; fileLastModified: number | null }) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO drive_upload_sessions (item_id, upload_id, part_size, file_last_modified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [input.itemId, input.uploadId, input.partSize, input.fileLastModified, now, now]
  });
}

export async function getUploadSession(itemId: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_upload_sessions WHERE item_id = ? LIMIT 1", args: [itemId] });
  return result.rows[0] ? rowToUploadSession(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function findUploadSession(input: { parentId: string | null; name: string; sizeBytes: number; fileLastModified: number | null }) {
  const db = await ensureSchema();
  const result = input.parentId
    ? await db.execute({
        sql: `SELECT u.* FROM drive_upload_sessions u JOIN drive_items i ON i.id = u.item_id
          WHERE i.parent_id = ? AND i.name = ? AND i.size_bytes = ? AND i.status = 'uploading'
            AND (? IS NULL OR u.file_last_modified = ?)
          ORDER BY u.updated_at DESC LIMIT 1`,
        args: [input.parentId, input.name, input.sizeBytes, input.fileLastModified, input.fileLastModified]
      })
    : await db.execute({
        sql: `SELECT u.* FROM drive_upload_sessions u JOIN drive_items i ON i.id = u.item_id
          WHERE i.parent_id IS NULL AND i.name = ? AND i.size_bytes = ? AND i.status = 'uploading'
            AND (? IS NULL OR u.file_last_modified = ?)
          ORDER BY u.updated_at DESC LIMIT 1`,
        args: [input.name, input.sizeBytes, input.fileLastModified, input.fileLastModified]
      });
  return result.rows[0] ? rowToUploadSession(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function touchUploadSession(itemId: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "UPDATE drive_upload_sessions SET updated_at = ? WHERE item_id = ?", args: [new Date().toISOString(), itemId] });
}

export async function deleteUploadSession(itemId: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM drive_upload_sessions WHERE item_id = ?", args: [itemId] });
}

export async function completeFile(id: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "UPDATE drive_items SET status = 'active', updated_at = ? WHERE id = ? AND status = 'uploading'", args: [new Date().toISOString(), id] });
  await deleteUploadSession(id);
}

export async function renameItem(id: string, name: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "UPDATE drive_items SET name = ?, updated_at = ? WHERE id = ? AND status = 'active'", args: [name, new Date().toISOString(), id] });
}

export async function setFolderCover(id: string, storageKey: string | null) {
  const db = await ensureSchema();
  await db.execute({
    sql: "UPDATE drive_items SET cover_storage_key = ?, updated_at = ? WHERE id = ? AND kind = 'folder' AND status = 'active'",
    args: [storageKey, new Date().toISOString(), id]
  });
}

export async function trashItem(id: string) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.execute({
    sql: `WITH RECURSIVE descendants(id) AS (
      SELECT id FROM drive_items WHERE id = ? AND status = 'active'
      UNION ALL
      SELECT child.id FROM drive_items child JOIN descendants parent ON child.parent_id = parent.id WHERE child.status = 'active'
    )
    UPDATE drive_items SET status = 'trashed', trashed_at = ?, updated_at = ?
    WHERE id IN (SELECT id FROM descendants) AND status = 'active'`,
    args: [id, now, now]
  });
}

export async function restoreItem(id: string) {
  const db = await ensureSchema();
  const root = await getItem(id);
  if (!root || root.status !== "trashed" || !root.trashed_at) return;
  const now = new Date().toISOString();
  await db.execute({
    sql: `WITH RECURSIVE descendants(id) AS (
      SELECT id FROM drive_items WHERE id = ? AND status = 'trashed'
      UNION ALL
      SELECT child.id FROM drive_items child JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.status = 'trashed' AND child.trashed_at = ?
    )
    UPDATE drive_items SET status = 'active', trashed_at = NULL, updated_at = ?
    WHERE id IN (SELECT id FROM descendants) AND status = 'trashed' AND trashed_at = ?`,
    args: [id, root.trashed_at, now, root.trashed_at]
  });
}

async function listChildren(parentId: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_items WHERE parent_id = ? ORDER BY kind DESC, name COLLATE NOCASE", args: [parentId] });
  return result.rows.map((row) => rowToItem(row as unknown as Record<string, unknown>));
}

export async function getDeletionTree(id: string) {
  const root = await getItem(id);
  if (!root) return [];
  const items: DriveItem[] = [];
  const queue = [root];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length && index < 10000; index += 1) {
    const item = queue[index];
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    items.push(item);
    if (item.kind === "folder") queue.push(...await listChildren(item.id));
  }
  return items;
}

export async function permanentlyDeleteItems(ids: string[]) {
  if (!ids.length) return;
  const db = await ensureSchema();
  const placeholders = ids.map(() => "?").join(",");
  const shares = await db.execute({ sql: `SELECT id FROM drive_shares WHERE item_id IN (${placeholders})`, args: ids });
  const shareIds = shares.rows.map((row) => String(row.id));
  if (shareIds.length) {
    const sharePlaceholders = shareIds.map(() => "?").join(",");
    await db.execute({ sql: `DELETE FROM drive_share_attempts WHERE share_id IN (${sharePlaceholders})`, args: shareIds });
  }
  await db.execute({ sql: `DELETE FROM drive_shares WHERE item_id IN (${placeholders})`, args: ids });
  await db.execute({ sql: `DELETE FROM drive_items WHERE id IN (${placeholders})`, args: ids });
}

export async function getStorageStats() {
  const db = await ensureSchema();
  const result = await db.execute("SELECT COALESCE(SUM(size_bytes), 0) AS used, COUNT(*) AS count FROM drive_items WHERE kind = 'file' AND status = 'active'");
  return { used: Number(result.rows[0]?.used || 0), count: Number(result.rows[0]?.count || 0) };
}

function rowToShare(row: Record<string, unknown>) {
  return { ...row, download_count: Number(row.download_count) } as DriveShare;
}

export async function createShare(input: { id: string; itemId: string; token: string; passwordHash: string; expiresAt: string }) {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT INTO drive_shares (id, item_id, token, password_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [input.id, input.itemId, input.token, input.passwordHash, input.expiresAt, new Date().toISOString()]
  });
}

export async function listShares(itemId: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_shares WHERE item_id = ? ORDER BY created_at DESC", args: [itemId] });
  return result.rows.map((row) => rowToShare(row as unknown as Record<string, unknown>));
}

export async function getShareByToken(token: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_shares WHERE token = ? LIMIT 1", args: [token] });
  return result.rows[0] ? rowToShare(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function getShareById(id: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM drive_shares WHERE id = ? LIMIT 1", args: [id] });
  return result.rows[0] ? rowToShare(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function revokeShare(id: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "UPDATE drive_shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", args: [new Date().toISOString(), id] });
}

export async function recordShareDownload(id: string) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.execute({ sql: "UPDATE drive_shares SET download_count = download_count + 1, last_accessed_at = ? WHERE id = ?", args: [now, id] });
}

export async function itemBelongsToShare(itemId: string, rootItemId: string) {
  let currentId: string | null = itemId;
  const visited = new Set<string>();
  for (let depth = 0; currentId && depth < 100; depth += 1) {
    if (currentId === rootItemId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const item = await getItem(currentId);
    if (!item || item.status !== "active") return false;
    currentId = item.parent_id;
  }
  return false;
}

export async function getShareAttempt(shareId: string, clientKey: string) {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT failure_count, window_started_at, blocked_until FROM drive_share_attempts WHERE share_id = ? AND client_key = ? LIMIT 1", args: [shareId, clientKey] });
  const row = result.rows[0] as unknown as { failure_count: number; window_started_at: string; blocked_until: string | null } | undefined;
  return row ? { ...row, failure_count: Number(row.failure_count) } : null;
}

export async function recordFailedShareAttempt(shareId: string, clientKey: string) {
  const db = await ensureSchema();
  const now = new Date();
  const current = await getShareAttempt(shareId, clientKey);
  const windowExpired = !current || Date.parse(current.window_started_at) < now.getTime() - 15 * 60 * 1000;
  const failureCount = windowExpired ? 1 : current.failure_count + 1;
  const blockedUntil = failureCount >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
  await db.execute({
    sql: `INSERT INTO drive_share_attempts (share_id, client_key, failure_count, window_started_at, blocked_until)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(share_id, client_key) DO UPDATE SET failure_count = excluded.failure_count, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`,
    args: [shareId, clientKey, failureCount, windowExpired ? now.toISOString() : current.window_started_at, blockedUntil]
  });
  return { failureCount, blockedUntil };
}

export async function clearShareAttempts(shareId: string, clientKey: string) {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM drive_share_attempts WHERE share_id = ? AND client_key = ?", args: [shareId, clientKey] });
}
