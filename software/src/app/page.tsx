import Link from "next/link";
import React from "react";
import {
  DoorlockIcon,
  Esp32Icon,
  KeylockIcon,
  MonitoringIcon,
  NetworkIcon,
  RfidIcon,
  UsersIcon,
} from "~/components/icons";
import { Button } from "~/components/ui/button";

export default function HomePage() {
  return (
    <main className="container my-16 max-w-6xl">
      <section className="mt-32 flex flex-col items-center justify-center text-center">
        <KeylockIcon className="h-32 w-32 text-indigo-600" />
        <h1 className="typo-h1 mt-6">Keylock</h1>
        <p className="mt-2 max-w-md font-semibold text-muted-foreground text-xl leading-7">
          A centralized door lock system designed to enhance security and access
          management using RFID technology.
        </p>
      </section>

      <section className="mt-16">
        <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-3">
          <div className="flex flex-col items-center justify-center rounded-md bg-sky-200 p-6 md:p-12">
            <RfidIcon className="h-20 w-20 text-sky-800 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-sky-800 text-sm md:text-lg">
              Powered by RFID
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-slate-300 p-6 md:p-12">
            <DoorlockIcon className="h-20 w-20 text-slate-800 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-slate-800 text-sm md:text-lg">
              Centralized Door Lock
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-blue-200 p-6 md:p-12">
            <NetworkIcon className="h-20 w-20 text-blue-700 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-blue-700 text-sm md:text-lg">
              Networked Nodes
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-purple-300 p-6 md:p-12">
            <Esp32Icon className="h-20 w-20 text-purple-800 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-purple-800 text-sm md:text-lg">
              IoT-Enabled
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-green-200 p-6 md:p-12">
            <MonitoringIcon className="h-20 w-20 text-green-700 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-green-700 text-sm md:text-lg">
              Real-time Monitoring
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-md bg-neutral-300 p-6 md:p-12">
            <UsersIcon className="h-20 w-20 text-neutral-700 md:h-32 md:w-32" />
            <span className="mt-4 text-center font-bold text-neutral-700 text-sm md:text-lg">
              Role-Based Access Control
            </span>
          </div>
        </div>
      </section>

      <section className="mt-32 flex flex-col items-center justify-center text-center">
        <h2 className="typo-h2 font-bold">Empowering Facility Management</h2>
        <p className="mt-6 max-w-lg text-muted-foreground text-xl leading-7">
          Keylock is currently in ideation phase. We are working on what we want
          to achieve with this project.
        </p>
        <Button
          asChild
          className="mt-6 bg-blue-600 text-white hover:bg-blue-700"
        >
          <Link href="/get-started">Get Started</Link>
        </Button>
      </section>
    </main>
  );
}
