import { auth } from "@/auth";

export async function requireUserId(): Promise<number> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return Number(id);
}
