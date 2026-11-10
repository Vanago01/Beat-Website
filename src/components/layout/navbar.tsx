"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Heart,
  Library,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  User,
  X,
} from "lucide-react";
import { Logo } from "./logo";
import { SearchOverlay } from "./search-overlay";
import { CurrencySwitch } from "./currency-switch";
import { Dropdown, MenuItem } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useCart } from "@/stores/cart";
import { useMessages } from "@/stores/messages";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/beats", label: "Explore Beats" },
  // Only shown in the top bar on wide screens (it would crowd it otherwise).
  { href: "/packs", label: "Beat Packs", wide: true },
  { href: "/producers", label: "Producers" },
  { href: "/sell", label: "Sell Beats" },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function CartButton() {
  const count = useCart((s) => s.items.length);
  const setOpen = useCart((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative grid h-10 w-10 place-items-center rounded-full text-ink-100 transition hover:bg-white/[0.08] hover:text-white"
      aria-label={`Shopping cart, ${count} items`}
    >
      <ShoppingBag className="h-[19px] w-[19px]" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent ring-2 ring-ink-950">
          {count}
        </span>
      )}
    </button>
  );
}

const badgeText = (n: number) => (n > 9 ? "9+" : String(n));

function MessagesButton({ pathname }: { pathname: string | null }) {
  const { user } = useAuth();
  const unread = useMessages((s) => s.unread);
  if (!user) return null;
  const active = isActive(pathname, "/messages");
  return (
    <Link
      href="/messages"
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/[0.08]",
        active ? "bg-white/[0.06] text-white" : "text-ink-100 hover:text-white",
      )}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
    >
      <MessageCircle className="h-[19px] w-[19px]" />
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent ring-2 ring-ink-950">
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}

function AccountMenu({ pathname }: { pathname: string | null }) {
  const { user, profile, loading, isSeller, isAdmin, signOut } = useAuth();
  const unread = useMessages((s) => s.unread);
  const router = useRouter();

  if (loading) return <span className="skeleton h-10 w-10 rounded-full" aria-hidden />;

  if (!user) {
    return (
      <div className="hidden items-center gap-1.5 lg:flex">
        <Link href={pathname && pathname !== "/" ? `/login?next=${encodeURIComponent(pathname)}` : "/login"} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Sign in
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>
          Join free
        </Link>
      </div>
    );
  }

  const name = profile?.producer_name || profile?.display_name || profile?.username || user.email || "Account";
  const go = (href: string, close: () => void) => {
    close();
    router.push(href);
  };

  return (
    <Dropdown
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
          className={cn("rounded-full ring-2 transition", open ? "ring-accent/60" : "ring-transparent hover:ring-white/20")}
        >
          <Avatar path={profile?.avatar_path} name={name} size={38} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar path={profile?.avatar_path} name={name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-ink-400">{profile ? `@${profile.username}` : user.email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-white/[0.07]" />
          <MenuItem onClick={() => go("/account", close)}>
            <User className="h-4 w-4 text-ink-300" /> My profile
          </MenuItem>
          <MenuItem onClick={() => go("/messages", close)}>
            <MessageCircle className="h-4 w-4 text-ink-300" /> Messages
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-on-accent">{badgeText(unread)}</span>
            )}
          </MenuItem>
          <MenuItem onClick={() => go("/account/library", close)}>
            <Library className="h-4 w-4 text-ink-300" /> Purchased beats
          </MenuItem>
          <MenuItem onClick={() => go("/account/orders", close)}>
            <Receipt className="h-4 w-4 text-ink-300" /> Order history
          </MenuItem>
          <MenuItem onClick={() => go("/favorites", close)}>
            <Heart className="h-4 w-4 text-ink-300" /> Favorites
          </MenuItem>
          <div className="my-1 h-px bg-white/[0.07]" />
          {isSeller ? (
            <MenuItem onClick={() => go("/dashboard", close)}>
              <LayoutDashboard className="h-4 w-4 text-ink-300" /> Producer studio
            </MenuItem>
          ) : (
            <MenuItem onClick={() => go("/sell", close)}>
              <Store className="h-4 w-4 text-ink-300" /> Become a seller
            </MenuItem>
          )}
          {isAdmin && (
            <MenuItem onClick={() => go("/admin", close)} className="text-accent-300">
              <ShieldCheck className="h-4 w-4" /> Admin dashboard
            </MenuItem>
          )}
          <MenuItem onClick={() => go("/account/security", close)}>
            <Settings className="h-4 w-4 text-ink-300" /> Account settings
          </MenuItem>
          <div className="my-1 h-px bg-white/[0.07]" />
          <MenuItem
            danger
            onClick={() => {
              close();
              signOut();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

function NavbarView({ pathname }: { pathname: string | null }) {
  const { user, isSeller, isAdmin, signOut } = useAuth();
  const unread = useMessages((s) => s.unread);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-500",
          scrolled ? "border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-2xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-6 px-4 sm:px-6 lg:px-8">
          {/* Signed in, narrow phones need the room for the account icons: show just the mark. */}
          <Logo wordmarkClassName={user ? "max-[399px]:hidden" : undefined} />

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
                  "wide" in item && item.wide && "hidden xl:inline-block",
                  isActive(pathname, item.href) ? "text-white" : "text-ink-300 hover:text-white",
                )}
              >
                {item.label}
                {isActive(pathname, item.href) && (
                  <span className="absolute inset-x-4 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-10 items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] pl-3.5 pr-2 text-[13px] text-ink-300 transition hover:border-white/20 hover:text-white md:flex lg:hidden xl:flex"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="pr-6">Search</span>
              <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-full text-ink-100 hover:bg-white/[0.08] md:hidden lg:grid xl:hidden"
              aria-label="Search"
            >
              <Search className="h-[19px] w-[19px]" />
            </button>
            <CurrencySwitch className="mx-1 hidden sm:inline-flex" />
            <MessagesButton pathname={pathname} />
            <Link
              href="/favorites"
              className={cn(
                "hidden h-10 w-10 place-items-center rounded-full transition hover:bg-white/[0.08] sm:grid",
                pathname === "/favorites" ? "text-[#ff5c8a]" : "text-ink-100 hover:text-white",
              )}
              aria-label="Favorites"
            >
              <Heart className="h-[19px] w-[19px]" />
            </Link>
            <CartButton />
            <div className="ml-1">
              <AccountMenu pathname={pathname} />
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-full text-ink-100 hover:bg-white/[0.08] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <div aria-hidden className="h-[68px]" />

      <SearchOverlay open={searchOpen} onClose={closeSearch} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="right" label="Menu">
        <div className="flex items-center justify-between px-6 py-5">
          <Logo />
          <button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex flex-col px-3" aria-label="Mobile">
          {[
            ...NAV,
            ...(user ? [{ href: "/messages", label: "Messages" }] : []),
            { href: "/favorites", label: "Favorites" },
            { href: "/cart", label: "Shopping Cart" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-2xl font-bold tracking-tight transition",
                isActive(pathname, item.href) ? "bg-white/[0.06] text-white" : "text-ink-200 hover:bg-white/[0.04]",
              )}
            >
              {item.label}
              {item.href === "/messages" && unread > 0 && (
                <span className="rounded-full bg-accent px-2.5 font-sans text-sm leading-7 text-on-accent">{badgeText(unread)}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-white/[0.07] px-6 py-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-sm text-ink-300">Currency</span>
            <CurrencySwitch />
          </div>
          {user ? (
            <div className="grid gap-2">
              <Link href="/account" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                My profile
              </Link>
              <Link href="/account/library" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
                Purchased beats
              </Link>
              {isSeller && (
                <Link href="/dashboard" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
                  Producer studio
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" className={buttonVariants({ variant: "ghost", className: "w-full text-accent-300" })}>
                  Admin dashboard
                </Link>
              )}
              <button onClick={() => signOut()} className={buttonVariants({ variant: "ghost", className: "w-full text-danger" })}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              <Link href="/register" className={buttonVariants({ className: "w-full" })}>
                Create free account
              </Link>
              <Link href="/login" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                Sign in
              </Link>
            </div>
          )}
        </div>
      </Sheet>
    </>
  );
}

function NavbarWithPathname() {
  return <NavbarView pathname={usePathname()} />;
}

/**
 * The prerendered shell shows the navbar without route-specific state; the
 * pathname-aware version streams in (required for dynamic routes with Cache Components).
 */
export function Navbar() {
  return (
    <Suspense fallback={<NavbarView pathname={null} />}>
      <NavbarWithPathname />
    </Suspense>
  );
}
