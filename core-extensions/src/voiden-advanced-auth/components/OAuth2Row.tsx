/**
 * Table-like key-value row matching the ProseMirror table cell pattern.
 * Mimics: h-6, p-1 px-2, border-r between columns, hover:bg-muted/50.
 */
import React from "react";

const rowClass =
  "flex hover:bg-muted/50 transition-colors";

const keyCellClass =
  "p-1 px-2 h-6 flex items-center text-sm font-mono text-comment whitespace-nowrap border-r border-border shrink-0";

const valueCellClass =
  "p-1 px-2 h-6 flex items-center text-sm font-mono text-text w-full min-w-0";

const inputClass =
  "w-full bg-transparent text-sm font-mono text-text outline-none placeholder:text-comment/40";

const selectInputClass =
  "w-full bg-transparent text-sm font-mono text-text outline-none cursor-pointer";

interface RowProps {
  k: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  keyWidth?: number;
}

export const Row: React.FC<RowProps> = ({
  k,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  keyWidth = 130,
}) => (
  <div className={rowClass}>
    <div className={keyCellClass} style={{ width: keyWidth }}>
      {k}
    </div>
    <div className={valueCellClass}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputClass}${disabled ? " opacity-50 cursor-not-allowed" : ""}`}
        spellCheck={false}
      />
    </div>
  </div>
);

interface SelectRowProps {
  k: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  keyWidth?: number;
}

export const SelectRow: React.FC<SelectRowProps> = ({
  k,
  value,
  onChange,
  options,
  disabled,
  keyWidth = 130,
}) => (
  <div className={rowClass}>
    <div className={keyCellClass} style={{ width: keyWidth }}>
      {k}
    </div>
    <div className={valueCellClass}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${selectInputClass}${disabled ? " opacity-50 cursor-not-allowed" : ""}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

interface CheckboxRowProps {
  k: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  keyWidth?: number;
}

export const CheckboxRow: React.FC<CheckboxRowProps> = ({
  k,
  checked,
  onChange,
  disabled,
  keyWidth = 130,
}) => (
  <div className={rowClass}>
    <div className={keyCellClass} style={{ width: keyWidth }}>
      {k}
    </div>
    <div className={valueCellClass}>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="rounded border-stone-700/50"
        />
        <span className="text-sm font-mono text-text">{checked ? "enabled" : "disabled"}</span>
      </label>
    </div>
  </div>
);
