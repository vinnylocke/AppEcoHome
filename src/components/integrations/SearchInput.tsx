import React from "react";
import { Search, X } from "lucide-react";

// Small shared search box for the integrations lists. Controlled.
interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}

export default function SearchInput({ value, onChange, placeholder = "Search…", testId }: Props) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full sm:w-56 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-lowest pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-rhozly-primary/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-rhozly-on-surface-variant hover:bg-rhozly-surface"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
