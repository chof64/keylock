import React from "react";

export const MonitoringIcon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Monitoring Icon</title>
      <rect x="10" y="10" width="44" height="30" rx="3" strokeLinecap="round" />
      <path d="M22 40L22 50" strokeLinecap="round" />
      <path d="M42 40L42 50" strokeLinecap="round" />
      <path d="M18 50L46 50" strokeLinecap="round" />
      <path
        d="M16 20L24 28L30 22L38 30L48 20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="20" r="2" fill="currentColor" />
      <circle cx="38" cy="30" r="2" fill="currentColor" />
      <circle cx="30" cy="22" r="2" fill="currentColor" />
      <circle cx="24" cy="28" r="2" fill="currentColor" />
      <circle cx="16" cy="20" r="2" fill="currentColor" />
    </svg>
  );
};

export default MonitoringIcon;
