import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminUsers, type AdminUser } from "@/components/admin/admin-users";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users", robots: { index: false } };

const ROLES = [
  { value: "", label: "Everyone" },
  { value: "buyer", label: "Buyers" },
  { value: "seller", label: "Sellers" },
  { value: "admin", label: "Admins" },
];
const PAGE = 50;

async function Users({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  const viewer = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const role = typeof sp.role === "string" && ["buyer", "seller", "admin"].includes(sp.role) ? (sp.role as AdminUser["role"]) : undefined;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_query: q || undefined, p_role: role, p_limit: PAGE, p_offset: page * PAGE });
  if (error) return <p className="text-danger">{error.message}</p>;
  const res = data as unknown as { total: number; items: AdminUser[] };
  const href = (p: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    Object.entries({ q: q || undefined, role, ...p }).forEach(([k, v]) => v !== undefined && v !== "" && params.set(k, String(v)));
    return `/admin/users?${params}`;
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex gap-1" aria-label="Role">
          {ROLES.map((r) => (
            <Link key={r.value} href={href({ role: r.value || undefined, page: undefined })} className={cn("rounded-full px-3.5 py-1.5 text-sm transition", (role ?? "") === r.value ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white")}>
              {r.label}
            </Link>
          ))}
        </nav>
        <Form action="/admin/users" className="glass flex h-10 items-center gap-2 rounded-full px-4">
          {role && <input type="hidden" name="role" value={role} />}
          <Search className="h-4 w-4 text-ink-400" />
          <input name="q" defaultValue={q} placeholder="Username, email or name…" className="w-56 bg-transparent text-sm outline-none placeholder:text-ink-400" aria-label="Search users" />
        </Form>
      </div>
      <p className="mb-4 text-sm text-ink-400">{res.total} {res.total === 1 ? "user" : "users"}</p>
      <AdminUsers users={res.items} currentUserId={viewer.id} />
      {res.total > PAGE && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 0 && <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>← Previous</Link>}
          <span className="text-ink-400">Page {page + 1} of {Math.ceil(res.total / PAGE)}</span>
          {(page + 1) * PAGE < res.total && <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Next →</Link>}
        </div>
      )}
    </>
  );
}

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}
