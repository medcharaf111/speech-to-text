import axios from "axios";

const API_URL = import.meta.env.VITE_APP_API_URL;

export const fetchLanguages = async (isAdmin) => {
  try {
    const response = await axios.get(`${API_URL}/api/languages?isAdmin=${isAdmin}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching languages:", error);
    throw error;
  }
};

export const fetchVoiceModel = async (language) => {
  try {
    const response = await axios.get(`${API_URL}/api/voiceModelList?language=${language}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching languages:", error);
    throw error;
  }
};
