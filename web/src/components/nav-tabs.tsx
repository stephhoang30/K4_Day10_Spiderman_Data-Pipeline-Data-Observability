"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/", label: "Overview", blurb: "Pipeline map" },
  { href: "/crawl", label: "Crawl", blurb: "Lấy dữ liệu" },
  { href: "/clean", label: "Clean", blurb: "Làm sạch" },
  { href: "/corrupt", label: "Corrupt", blurb: "Làm xấu" },
  { href: "/compare", label: "Compare", blurb: "Đối chiếu" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Pipeline views" className="scroll-shell -mb-px overflow-x-auto">
      <ul className="flex min-w-max items-end gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex flex-col rounded-t-md border border-b-0 px-4 py-2 transition-colors ${
                  active
                    ? "border-line bg-surface text-brand-blue"
                    : "border-transparent text-ink-soft hover:bg-surface/70 hover:text-brand-blue"
                }`}
              >
                <span className="text-sm font-semibold tracking-tight">
                  {item.label}
                </span>
                <span className="text-[11px] text-ink-faint">{item.blurb}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
