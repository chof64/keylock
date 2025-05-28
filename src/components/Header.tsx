import Link from "next/link";
import { KeylockIcon } from "./icons";

export default function Header() {
  return (
    <header className="container flex h-14 items-center justify-between">
      <Link className="group" href="/">
        <div className="inline-flex gap-1">
          <KeylockIcon className="h-8 w-8 text-indigo-600 group-hover:text-indigo-600/60" />
          <div className="mt-0.5 font-semibold text-xl group-hover:text-muted-foreground">
            Keylock
          </div>
        </div>
      </Link>
      <nav className="flex gap-6">
        <Link className="font-medium" href="/dashboard">
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
