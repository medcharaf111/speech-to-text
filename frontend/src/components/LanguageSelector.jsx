import React from "react";
import { MdGTranslate } from "react-icons/md";
import { IoInformationCircleSharp } from "react-icons/io5";

const LanguageSelector = ({
  languages,
  selectedLanguage,
  onLanguageChange,
}) => {
  return (
    <div className="form-group">
      <label htmlFor="languageSelect" className="form-label fw-bold">
        <MdGTranslate className="me-2" size={20} />
        Select Your Preferred Language
      </label>
      <select
        id="languageSelect"
        className="form-select form-select-lg shadow-sm"
        value={selectedLanguage}
        onChange={(e) => onLanguageChange(e.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
      <div className="form-text mt-2">
        <IoInformationCircleSharp className="me-1" size={18} />
        Transcriptions will be displayed in this language.
      </div>
    </div>
  );
};

export default LanguageSelector;
