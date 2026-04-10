import React from "react";

type InfoHintProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export const InfoHint: React.FC<InfoHintProps> = ({
  label,
  children,
  className = "",
}) => {
  return (
    <span
      className={`relative inline-flex items-center align-middle group ${className}`}
    >
      <button
        type="button"
        className="text-blue-500 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded p-0.5"
        aria-label={label}
      >
        <i className="fa-solid fa-circle-info text-sm" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 absolute z-[60] left-0 bottom-full mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-gray-900 text-white text-xs poppins p-3 shadow-lg leading-relaxed"
      >
        {children}
      </span>
    </span>
  );
};

type LabelWithHintProps = {
  label: string;
  hintTitle: string;
  children: React.ReactNode;
};

export const LabelWithHint: React.FC<LabelWithHintProps> = ({
  label,
  hintTitle,
  children,
}) => (
  <div className="poppins font-medium flex items-start gap-1">
    <span>{label}</span>
    <InfoHint label={hintTitle}>{children}</InfoHint>
  </div>
);
