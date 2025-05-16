import React, { useEffect, useState } from "react";
import { MdGTranslate } from "react-icons/md";
import { IoInformationCircleSharp } from "react-icons/io5";
import { fetchLanguages } from "../utils/api";
import Select from "react-select";

const LanguageSelector = ({ selectedLanguage, onLanguageChange, isAdmin = false }) => {
  const [languages, setLanguages] = useState([]);

  useEffect(() => {
    // Fetch supported languages
    const getLanguages = async () => {
      try {
        const languageList = await fetchLanguages(isAdmin);
        setLanguages(languageList.map((item) => ({ value: item.code, label: item.name })));
      } catch (error) {
        console.error("Failed to fetch languages:", error);
      }
    };

    getLanguages();
  }, []);

  return (
    <div className="form-group">
      <label className="form-label fw-bold">
        <MdGTranslate className="me-2" size={20} />
        Select Your {isAdmin ? "Speaking" : "Preferred"} Language
      </label>
      <Select
        options={languages}
        className="form-select-lg"
        value={languages.find((item) => item.value === selectedLanguage)}
        onChange={(item) => onLanguageChange(item.value)}
        isSearchable
      />

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
