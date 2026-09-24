import MemoryClient from "../components/MemoryClient";
import AccountBar from "../components/AccountBar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MemoryPage({
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
      <MemoryClient conversationId={conversationId} />
    </>
  );
}
