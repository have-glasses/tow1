"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearOwnerSession, isOwnerAuthenticated } from "@/lib/auth";
import { createDeleteUrl } from "@/lib/cos";
import { addCategoryItem, createCategory, createFolder, deleteCategory, getDeletionTree, getItem, permanentlyDeleteItems, removeCategoryItem, renameItem, reorderCategories, restoreItem, setItemCategories, toggleCategoryPinned, toggleItemPinned, trashItem } from "@/lib/db";

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
  const id = crypto.randomUUID();
  await createFolder(id, name, parentId);
  for (const categoryId of formData.getAll("categoryId").map(String).filter(Boolean)) await addCategoryItem(categoryId, id);
  revalidatePath("/");
  return id;
}
export async function createCategoryAction(formData: FormData) { await requireOwner(); await createCategory(crypto.randomUUID(), cleanName(formData.get("name")), String(formData.get("color") || "#4b85a7")); revalidatePath("/"); }
export async function toggleCategoryPinnedAction(formData: FormData) { await requireOwner(); await toggleCategoryPinned(String(formData.get("id") || "")); revalidatePath("/"); }
export async function deleteCategoryAction(formData: FormData) { await requireOwner(); await deleteCategory(String(formData.get("id") || "")); revalidatePath("/"); }
export async function batchDeleteCategoriesAction(formData: FormData) { await requireOwner(); for (const id of formData.getAll("categoryId").map(String).filter(Boolean)) await deleteCategory(id); revalidatePath("/"); }
export async function reorderCategoriesAction(formData: FormData) { await requireOwner(); let ids: string[] = []; try { ids = JSON.parse(String(formData.get("order") || "[]")); } catch { throw new Error("分类排序数据无效"); } await reorderCategories(ids.filter(Boolean)); revalidatePath("/"); }
export async function addCategoryItemAction(formData: FormData) { await requireOwner(); const categoryId=String(formData.get("categoryId")||""); const itemId=String(formData.get("itemId")||""); const item=await getItem(itemId); if(!categoryId||!item||item.status!=="active") throw new Error("项目不存在"); await addCategoryItem(categoryId,itemId); revalidatePath("/"); }
export async function removeCategoryItemAction(formData: FormData) { await requireOwner(); await removeCategoryItem(String(formData.get("categoryId")||""), String(formData.get("itemId")||"")); revalidatePath("/"); }

export async function renameItemAction(formData: FormData) {
  await requireOwner();
  await renameItem(String(formData.get("id") || ""), cleanName(formData.get("name")));
  await setItemCategories(String(formData.get("id") || ""), formData.getAll("categoryId").map(String));
  revalidatePath("/");
}

export async function trashItemAction(formData: FormData) {
  await requireOwner();
  await trashItem(String(formData.get("id") || ""));
  revalidatePath("/");
}

export async function toggleItemPinnedAction(formData: FormData) {
  await requireOwner();
  await toggleItemPinned(String(formData.get("id") || ""));
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
