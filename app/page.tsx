import { redirect } from "next/navigation";
import DriveWorkspace from "@/components/DriveWorkspace";
import { isOwnerAuthenticated } from "@/lib/auth";
import { getCategory, getItem, getStorageStats, listCategories, listCategoryItems, listItemCategoryIds, listItems } from "@/lib/db";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ folder?: string; view?: string; category?: string }> }) {
  if (!(await isOwnerAuthenticated())) redirect("/login");
  const query = await searchParams;
  const trash = query.view === "trash";
  const category = !trash && query.category ? await getCategory(query.category) : null;
  if (query.category && !category) redirect("/");
  const parent = !trash && query.folder ? await getItem(query.folder) : null;
  if (query.folder && (!parent || parent.kind !== "folder" || parent.status !== "active")) redirect("/");
  const [items, stats, categories, availableItems] = await Promise.all([category ? listCategoryItems(category.id) : listItems(parent?.id || null, trash), getStorageStats(), listCategories(), category ? listItems(null, false) : Promise.resolve([])]);
  const quotaGb = Number(process.env.NEXT_PUBLIC_STORAGE_QUOTA_GB || 0);
  const memberships = Object.fromEntries(await Promise.all(items.map(async (item) => [item.id, await listItemCategoryIds(item.id)])));
  return <DriveWorkspace items={items} parent={parent} trash={trash} category={category} categories={categories} availableItems={availableItems} categoryMemberships={memberships} stats={{ ...stats, quotaBytes: quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : null }} />;
}
