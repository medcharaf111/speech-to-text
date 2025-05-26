import { useEffect, useState } from "react";
import Select from "react-select";
import { fetchVoiceModel } from "../utils/api";

function camelize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const VoiceModelSelector = ({ selectedVoiceModel, onChange, selectedLanguage }) => {
  const [voiceModels, setVoiceModels] = useState([]);

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
        onChange(languageList[0]?.name || "en-US-Neural2-C");
      } catch (error) {
        console.error("Failed to fetch languages:", error);
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
    </div>
  );
};

export default VoiceModelSelector;
