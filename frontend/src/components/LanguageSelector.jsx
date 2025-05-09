import React from "react";

const LanguageSelector = ({
  languages,
  selectedLanguage,
  onLanguageChange,
}) => {
  return (
    <div className="form-group">
      <label htmlFor="languageSelect" className="form-label">
        <strong>Select Your Preferred Language:</strong>
      </label>
      <select
        id="languageSelect"
        className="form-select"
        value={selectedLanguage}
        onChange={(e) => onLanguageChange(e.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
      <small className="form-text text-muted">
        Transcriptions will be displayed in this language.
      </small>
    </div>
  );
};

export default LanguageSelector;
