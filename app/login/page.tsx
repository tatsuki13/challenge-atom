import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm";
import { login } from "../auth-actions";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="login" action={login} />;
}
