import Image from "next/image";
import Link from "next/link";
import { NavTabs } from "./nav-tabs";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/vinuni_logo.svg"
              alt="VinUniversity"
              width={40}
              height={40}
            />
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold leading-tight tracking-tight text-ink">
                Data Pipeline &amp; Data Observability
              </span>
              <span className="text-xs leading-tight text-ink-faint">
                VinUni · K4 Day 10 · Spiderman
              </span>
            </span>
          </Link>

          <p className="max-w-md text-xs leading-relaxed text-ink-soft">
            Mọi giá trị trên dashboard được đọc trực tiếp từ artifact trong{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px]">
              data/
            </code>{" "}
            tại thời điểm request. Không có dữ liệu mẫu.
          </p>
        </div>

        <NavTabs />
      </div>
    </header>
  );
}
