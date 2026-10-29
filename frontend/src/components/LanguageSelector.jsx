import { useEffect, useState } from "react";
import { MdGTranslate } from "react-icons/md";
import { IoInformationCircleSharp } from "react-icons/io5";
import Select from "react-select";
import { fetchLanguages } from "../utils/api";
import { selectStyles } from "../utils/selectStyles";

// compact: no label or helper text (used in the listener's control bar).
// theme: "light" | "dark" | "auto" for the dropdown colours.
const LanguageSelector = ({ selectedLanguage, onLanguageChange, isAdmin = false, compact = false, theme = "light", testId }) => {
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchLanguages(isAdmin)
      .then((list) => {
        if (!cancelled) setLanguages(list.map((item) => ({ value: item.code, label: item.name })));
      })
      .catch((error) => console.error("Failed to fetch languages:", error));
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const select = (
    <Select
      options={languages}
      value={languages.find((item) => item.value === selectedLanguage) || null}
      onChange={(item) => item && onLanguageChange(item.value)}
      isSearchable
      placeholder={languages.length ? "Choose a language" : "Loading languages…"}
      styles={selectStyles(theme)}
      menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
      menuPosition="fixed"
      aria-label={isAdmin ? "Speaking language" : "Your language"}
      inputId={testId}
    />
  );

  if (compact) return <div data-testid={testId ? `${testId}-wrap` : undefined}>{select}</div>;

  return (
    <div className="form-group">
      <label className="form-label fw-bold" htmlFor={testId}>
        <MdGTranslate className="me-2" size={20} />
        Select Your {isAdmin ? "Speaking" : "Preferred"} Language
      </label>
      {select}
      {!isAdmin && (
        <div className="form-text mt-2">
          <IoInformationCircleSharp className="me-1" size={18} />
          Transcriptions will be displayed in this language.
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
