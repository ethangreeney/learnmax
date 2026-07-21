'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavigationLink = {
  href: string;
  label: string;
};

function isCurrentRoute(pathname: string, href: string) {
  if (href === '/learn') {
    return (
      pathname === '/learn' ||
      pathname.startsWith('/learn/') ||
      pathname.startsWith('/revise/')
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavigationLinks({
  links,
}: {
  links: NavigationLink[];
}) {
  const pathname = usePathname() || '';

  return (
    <nav
      aria-label="Primary navigation"
      className="flex items-center gap-1 text-sm"
    >
      {links.map((link) => {
        const current = isCurrentRoute(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={`rounded-md px-3 py-2 font-medium transition-colors ${
              current
                ? 'bg-white/8 text-white'
                : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
