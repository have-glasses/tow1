import { redirect } from "next/navigation";
import DriveWorkspace from "@/components/DriveWorkspace";
import { isOwnerAuthenticated } from "@/lib/auth";
import { getItem, getStorageStats, listItems } from "@/lib/db";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ folder?: string; view?: string }> }) {
  if (!(await isOwnerAuthenticated())) redirect("/login");
  const query = await searchParams;
  const trash = query.view === "trash";
  const parent = !trash && query.folder ? await getItem(query.folder) : null;
  if (query.folder && (!parent || parent.kind !== "folder" || parent.status !== "active")) redirect("/");
  const [items, stats] = await Promise.all([listItems(parent?.id || null, trash), getStorageStats()]);
  const quotaGb = Number(process.env.NEXT_PUBLIC_STORAGE_QUOTA_GB || 0);
  return <DriveWorkspace items={items} parent={parent} trash={trash} stats={{ ...stats, quotaBytes: quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : null }} />;
}
