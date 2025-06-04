import Link from "next/link";
import React from "react";
import {
  UsersIcon,
  DoorlockIcon,
  Esp32Icon,
  MonitoringIcon,
  NetworkIcon,
} from "~/components/icons";

export default function DashboardPage() {
  return (
    <main className="container my-16 max-w-6xl">
      <section className="mt-16">
        <h1 className="typo-h1 text-center">Dashboard</h1>
        <div className="mt-8 grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/users">
            <div className="flex flex-col items-center justify-center rounded-md bg-sky-200 p-6 transition-colors hover:bg-sky-300 md:p-12">
              <UsersIcon className="h-20 w-20 text-sky-800 md:h-32 md:w-32" />
              <span className="mt-4 text-center font-bold text-sky-800 text-sm md:text-lg">
                Manage Users
              </span>
            </div>
          </Link>
          <Link href="/rooms">
            <div className="flex flex-col items-center justify-center rounded-md bg-slate-300 p-6 transition-colors hover:bg-slate-400 md:p-12">
              <DoorlockIcon className="h-20 w-20 text-slate-800 md:h-32 md:w-32" />
              <span className="mt-4 text-center font-bold text-slate-800 text-sm md:text-lg">
                Manage Rooms
              </span>
            </div>
          </Link>
          <Link href="/nodes">
            <div className="flex flex-col items-center justify-center rounded-md bg-blue-200 p-6 transition-colors hover:bg-blue-300 md:p-12">
              <NetworkIcon className="h-20 w-20 text-blue-700 md:h-32 md:w-32" />
              <span className="mt-4 text-center font-bold text-blue-700 text-sm md:text-lg">
                Manage Nodes
              </span>
            </div>
          </Link>
          <Link href="/access-logs">
            <div className="flex flex-col items-center justify-center rounded-md bg-green-200 p-6 transition-colors hover:bg-green-300 md:p-12">
              <MonitoringIcon className="h-20 w-20 text-green-700 md:h-32 md:w-32" />
              <span className="mt-4 text-center font-bold text-green-700 text-sm md:text-lg">
                View Access Logs
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
