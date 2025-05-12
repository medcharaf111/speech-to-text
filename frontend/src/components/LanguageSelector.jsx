import React, { useEffect, useState } from "react";
import { MdGTranslate } from "react-icons/md";
import { IoInformationCircleSharp } from "react-icons/io5";
import { fetchLanguages } from "../utils/api";

const LanguageSelector = ({ selectedLanguage, onLanguageChange, isAdmin = false }) => {
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    // Fetch supported languages
    const getLanguages = async () => {
      try {
        const languageList = await fetchLanguages(isAdmin);
        setLanguages(languageList);
      } catch (error) {
        console.error("Failed to fetch languages:", error);
      }
    };

    getLanguages();
  }, []);
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
