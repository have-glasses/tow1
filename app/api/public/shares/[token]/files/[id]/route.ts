import { NextResponse } from "next/server";
import { createDownloadUrl } from "@/lib/cos";
import { getItem, getShareByToken, itemBelongsToShare, recordShareDownload } from "@/lib/db";
import { hasShareAccess, isShareActive } from "@/lib/shares";

export async function GET(_request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params;
  const share = await getShareByToken(token);
  if (!share || !isShareActive(share) || !(await hasShareAccess(share))) return NextResponse.json({ error: "分享访问未授权或已失效" }, { status: 403 });
  const [root, item] = await Promise.all([getItem(share.item_id), getItem(id)]);
  if (!root || root.status !== "active" || !item || item.kind !== "file" || item.status !== "active" || !item.storage_key) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  if (!(await itemBelongsToShare(item.id, root.id))) return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
  await recordShareDownload(share.id);
  return NextResponse.redirect(createDownloadUrl(item.storage_key));
}
