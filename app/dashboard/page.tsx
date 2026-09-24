import DashboardClient from "../components/DashboardClient";
import AccountBar from "../components/AccountBar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string | string[] }>;
}) {
  const value = (await searchParams).conversationId;
  const conversationId = typeof value === "string" ? value : undefined;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <AccountBar displayName={user.displayName} />
      <DashboardClient conversationId={conversationId} />
    </>
  );
}
