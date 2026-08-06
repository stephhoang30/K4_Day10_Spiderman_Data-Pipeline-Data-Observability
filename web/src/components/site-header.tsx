import Image from "next/image";
import Link from "next/link";
import { NavTabs } from "./nav-tabs";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-[110rem] px-5 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/vinuni_logo.svg"
              alt="VinUniversity"
              width={48}
              height={48}
            />
            <span className="flex flex-col">
              <span className="text-lg font-semibold leading-tight tracking-tight text-ink">
                Data Pipeline &amp; Data Observability
              </span>
              <span className="text-sm leading-tight text-ink-faint">
                VinUni · K4 Day 10 · Spiderman
              </span>
            </span>
          </Link>

          <p className="text-sm text-ink-faint">
            Số liệu đọc thẳng từ artifact trong{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono">data/</code> — không
            có dữ liệu mẫu.
          </p>
        </div>

        <NavTabs />
      </div>
    </header>
  );
}
