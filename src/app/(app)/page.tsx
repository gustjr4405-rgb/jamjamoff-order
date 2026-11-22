import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

export default async function Home() {
  const { isAdmin } = await requireSession();
  redirect(isAdmin ? "/dashboard" : "/orders");
}
