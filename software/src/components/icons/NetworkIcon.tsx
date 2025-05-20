import React from "react";

export const NetworkIcon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Network Icon</title>
      <circle cx="32" cy="18" r="8" strokeLinecap="round" />
      <circle cx="16" cy="42" r="8" strokeLinecap="round" />
      <circle cx="48" cy="42" r="8" strokeLinecap="round" />
      <path d="M32 26L16 34" strokeLinecap="round" />
      <path d="M32 26L48 34" strokeLinecap="round" />
      <path d="M16 42L48 42" strokeLinecap="round" />
      <circle cx="32" cy="18" r="3" fill="currentColor" />
      <circle cx="16" cy="42" r="3" fill="currentColor" />
      <circle cx="48" cy="42" r="3" fill="currentColor" />
    </svg>
  );
};

export default NetworkIcon;
