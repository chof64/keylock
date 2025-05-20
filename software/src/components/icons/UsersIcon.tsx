import React from "react";

export const UsersIcon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Users Icon</title>
      <circle cx="32" cy="20" r="8" strokeLinecap="round" />
      <path
        d="M46 48C46 40.268 39.732 34 32 34C24.268 34 18 40.268 18 48"
        strokeLinecap="round"
      />
      <circle cx="16" cy="18" r="5" strokeLinecap="round" />
      <path d="M8 36C8 30.477 11.5817 26 16 26" strokeLinecap="round" />
      <circle cx="48" cy="18" r="5" strokeLinecap="round" />
      <path d="M56 36C56 30.477 52.4183 26 48 26" strokeLinecap="round" />
      <path d="M18 48H46" strokeLinecap="round" />
    </svg>
  );
};

export default UsersIcon;
