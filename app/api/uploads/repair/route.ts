import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/auth";
import { createHeadUrl } from "@/lib/cos";
import { completeFile, listUploadingFiles } from "@/lib/db";

async function objectIsComplete(storageKey: string, expectedSize: number) {
  const response = await fetch(createHeadUrl(storageKey), { method: "HEAD", cache: "no-store" });
  if (!response.ok) return false;
  const actualSize = Number(response.headers.get("content-length") || 0);
  return Number.isFinite(actualSize) && actualSize === expectedSize;
}

export async function POST() {
  if (!(await isOwnerAuthenticated())) return NextResponse.json({ error: "登录已失效" }, { status: 401 });

  const items = await listUploadingFiles();
  let repaired = 0;

  for (const item of items) {
    if (!item.storage_key) continue;
    try {
      if (await objectIsComplete(item.storage_key, item.size_bytes)) {
        await completeFile(item.id);
        repaired += 1;
      }
    } catch {
      // A failed HEAD check just means this record cannot be repaired yet.
    }
  }

  return NextResponse.json({ checked: items.length, repaired });
}
