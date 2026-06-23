"use server";

import { redirect } from "next/navigation";
import { createOwnerSession, verifyOwner } from "@/lib/auth";

export async function loginAction(_state: { error: string }, formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  if (!verifyOwner(username, password)) return { error: "用户名或密码不正确" };
  await createOwnerSession();
  redirect("/");
}
