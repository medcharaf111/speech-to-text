import { useEffect, useState } from "react";
import Select from "react-select";
import { fetchVoiceModel } from "../utils/api";
import { FaExclamationTriangle } from "react-icons/fa";

function camelize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const VoiceModelSelector = ({ selectedVoiceModel, onChange, selectedLanguage }) => {
  const [voiceModels, setVoiceModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getVoiceModel = async () => {
      try {
        const languageList = await fetchVoiceModel(selectedLanguage);
        setVoiceModels(
          languageList.map((item) => ({
            value: item.name,
            label: `${item.name.split("-").pop()} (${camelize(item.ssmlGender)})`,
          }))
        );
        onChange(languageList?.[0]?.name);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch languages:", error);
        setIsLoading(false);
      }
    };

    getVoiceModel();
  }, [selectedLanguage]);

  return (
    <div className="form-group mt-3">
      <label className="form-label fw-bold">Select Your Voice Model</label>
      <Select
        options={voiceModels}
        className="form-select-lg"
        value={voiceModels.find((item) => item.value === selectedVoiceModel)}
        onChange={(item) => onChange(item.value)}
        isSearchable
      />
      {!isLoading && voiceModels.length <= 0 && (
        <div
          style={{
            background: "#fffbe6",
            border: "1px solid #ffe58f",
            padding: 10,
            borderRadius: 4,
            cursor: "pointer",
            display: "inline-block",
            marginBottom: 12,
          }}
        >
          <FaExclamationTriangle style={{ marginRight: 6 }} />
          Real-time speech is not supported in this language.
        </div>
      )}
    </div>
  );
};

export default VoiceModelSelector;
