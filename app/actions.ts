"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearOwnerSession, isOwnerAuthenticated } from "@/lib/auth";
import { createDeleteUrl } from "@/lib/cos";
import { createFolder, getDeletionTree, getItem, permanentlyDeleteItems, renameItem, restoreItem, trashItem } from "@/lib/db";

async function requireOwner() {
  if (!(await isOwnerAuthenticated())) throw new Error("登录已失效");
}

function cleanName(value: FormDataEntryValue | null) {
  const name = String(value || "").trim();
  if (!name || name.length > 180 || /[\\/:*?\"<>|]/.test(name)) throw new Error("名称不能为空，且不能包含特殊字符");
  return name;
}

export async function createFolderAction(formData: FormData) {
  await requireOwner();
  const name = cleanName(formData.get("name"));
  const parentId = String(formData.get("parentId") || "") || null;
  if (parentId) {
    const parent = await getItem(parentId);
    if (!parent || parent.kind !== "folder" || parent.status !== "active") throw new Error("目标文件夹不存在");
  }
  await createFolder(crypto.randomUUID(), name, parentId);
  revalidatePath("/");
}

export async function renameItemAction(formData: FormData) {
  await requireOwner();
  await renameItem(String(formData.get("id") || ""), cleanName(formData.get("name")));
  revalidatePath("/");
}

export async function trashItemAction(formData: FormData) {
  await requireOwner();
  await trashItem(String(formData.get("id") || ""));
  revalidatePath("/");
}

export async function restoreItemAction(formData: FormData) {
  await requireOwner();
  await restoreItem(String(formData.get("id") || ""));
  revalidatePath("/");
}

export async function permanentlyDeleteItemAction(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id") || "");
  const items = await getDeletionTree(id);
  const root = items.find((item) => item.id === id);
  if (!root || root.status !== "trashed") throw new Error("只能永久删除回收站里的项目");
  for (const item of items) {
    const storageKeys = [item.storage_key, item.cover_storage_key].filter((key): key is string => Boolean(key));
    for (const storageKey of storageKeys) {
      const response = await fetch(createDeleteUrl(storageKey), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(`无法删除存储文件：${item.name}`);
    }
  }
  await permanentlyDeleteItems(items.map((item) => item.id));
  revalidatePath("/");
}

export async function logoutAction() {
  await clearOwnerSession();
  redirect("/login");
}
