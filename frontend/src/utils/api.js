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

// Resolves to { token, expiresAt }. Throws an Error with a user-facing message on failure.
export const adminLogin = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/api/admin/login`, { email, password });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const serverMessage = error.response?.data?.error;
    if (status === 401) throw new Error("Invalid credentials. Please try again.");
    if (status === 429) throw new Error(serverMessage || "Too many attempts. Try again later.");
    throw new Error(serverMessage || "Could not reach the server. Please try again.");
  }
};
