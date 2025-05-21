import React from "react";

export const Esp32Icon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>ESP32 Icon</title>
      <rect x="12" y="14" width="40" height="28" rx="3" strokeLinecap="round" />
      <rect x="20" y="22" width="24" height="12" rx="1" strokeLinecap="round" />
      <circle cx="24" cy="28" r="2" fill="currentColor" />
      <circle cx="32" cy="28" r="2" fill="currentColor" />
      <circle cx="40" cy="28" r="2" fill="currentColor" />
      <path d="M16 20L16 36" strokeLinecap="round" />
      <path d="M48 20L48 36" strokeLinecap="round" />
      <path
        d="M24 42L32 50L40 42"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Esp32Icon;
