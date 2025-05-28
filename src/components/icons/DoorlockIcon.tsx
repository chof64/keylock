import React from "react";

export const DoorlockIcon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Door Lock Icon</title>
      <rect x="14" y="10" width="36" height="50" rx="2" strokeLinecap="round" />
      <rect
        x="22"
        y="25"
        width="20"
        height="20"
        rx="10"
        strokeLinecap="round"
      />
      <circle cx="32" cy="35" r="3" fill="currentColor" />
      <path d="M32 35L32 28" strokeLinecap="round" />
      <rect x="44" y="30" width="4" height="10" rx="1" fill="currentColor" />
    </svg>
  );
};

export default DoorlockIcon;
