import Select from "react-select";

const voiceModels = [
  { value: "aura-2-thalia-en", label: "Thalia (Female)" },
  { value: "aura-2-andromeda-en", label: "Andromeda (Female)" },
  { value: "aura-2-helena-en", label: "Helena (Female)" },
  { value: "aura-2-apollo-en", label: "Apollo (Male)" },
  { value: "aura-2-arcas-en", label: "Arcas (Male)" },
  { value: "aura-2-aries-en", label: "Aries (Male)" },
];

const VoiceModelSelector = ({ selectedVoiceModel, onChange }) => {
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
