// react-select styling that matches the design tokens. theme: "light" | "dark" | "auto".
const PALETTES = {
  light: { bg: "#fffdf9", menu: "#ffffff", text: "#141821", muted: "#6b7280", line: "#e4ded3", accent: "#f59e0b", hover: "#f3eee4", onAccent: "#1a1200" },
  dark: { bg: "#161a23", menu: "#1d222d", text: "#f3f1ea", muted: "#9aa0ae", line: "#2a303c", accent: "#ffb547", hover: "#232938", onAccent: "#1a1200" },
};

export function resolveTheme(theme) {
  if (theme === "auto") {
    return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "dark" ? "dark" : "light";
}

export function selectStyles(theme = "light", { minHeight = 44 } = {}) {
  const c = PALETTES[resolveTheme(theme)];
  return {
    control: (base, state) => ({
      ...base,
      minHeight,
      borderRadius: 12,
      background: c.bg,
      borderColor: state.isFocused ? c.accent : c.line,
      boxShadow: state.isFocused ? `0 0 0 3px ${c.accent}33` : "none",
      cursor: "pointer",
      ":hover": { borderColor: c.accent },
    }),
    valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
    menu: (base) => ({ ...base, background: c.menu, borderRadius: 12, border: `1px solid ${c.line}`, overflow: "hidden", zIndex: 60 }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    option: (base, state) => ({
      ...base,
      background: state.isSelected ? c.accent : state.isFocused ? c.hover : "transparent",
      color: state.isSelected ? c.onAccent : c.text,
      cursor: "pointer",
    }),
    singleValue: (base) => ({ ...base, color: c.text }),
    input: (base) => ({ ...base, color: c.text }),
    placeholder: (base) => ({ ...base, color: c.muted }),
    multiValue: (base) => ({ ...base, background: c.hover, borderRadius: 8 }),
    multiValueLabel: (base) => ({ ...base, color: c.text, fontWeight: 500 }),
    multiValueRemove: (base) => ({ ...base, color: c.muted, borderRadius: "0 8px 8px 0", ":hover": { background: c.accent, color: c.onAccent } }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base) => ({ ...base, color: c.muted }),
    clearIndicator: (base) => ({ ...base, color: c.muted }),
    noOptionsMessage: (base) => ({ ...base, color: c.muted }),
  };
}
