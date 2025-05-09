import axios from "axios";

const API_URL = "http://localhost:5000/api";

export const fetchLanguages = async () => {
  try {
    const response = await axios.get(`${API_URL}/languages`);
    return response.data;
  } catch (error) {
    console.error("Error fetching languages:", error);
    throw error;
  }
};
