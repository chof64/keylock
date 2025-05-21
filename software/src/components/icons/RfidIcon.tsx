import React from "react";

export const RfidIcon = ({ className = "h-32 w-32" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>RFID Icon</title>
      {/* Card outline */}
      <rect
        x="8"
        y="16"
        width="48"
        height="32"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Chip rectangle */}
      <rect
        x="14"
        y="26"
        width="10"
        height="8"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
};

export default RfidIcon;
