import React from "react";

interface KeylockIconProps {
  className?: string;
  color?: string;
}

export const KeylockIcon = ({
  className = "h-10 w-10",
  color = "currentColor",
}: KeylockIconProps) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      stroke={color}
    >
      <title>Keylock Icon</title>
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        stroke={color}
        strokeWidth="2"
      />
      <path d="M12 15L15 8L8 10L10 16L12 15Z" fill={color} />
    </svg>
  );
};
