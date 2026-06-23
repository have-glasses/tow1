import { redirect } from "next/navigation";
import { isOwnerAuthenticated } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await isOwnerAuthenticated()) redirect("/");
  return <LoginForm />;
}
