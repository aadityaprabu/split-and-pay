import axios from "axios";
import { ApiStatus } from "../constants/constants";
import { Environment } from "../constants/environment";

const client = axios.create({
  baseURL: Environment.BACKEND_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Always resolves to the backend's { status, message, code, data } envelope,
// including for network errors where there is no response body.
function toEnvelope(error, endpoint) {
  console.error(`Request error for ${endpoint}:`, error);
  return error.response?.data ?? { status: ApiStatus.ERROR, message: "network error", code: 0 };
}

const api = {
  get: async (endpoint, config = {}) => {
    try {
      const response = await client.get(endpoint, config);
      return response.data;
    } catch (error) {
      return toEnvelope(error, endpoint);
    }
  },

  post: async (endpoint, data = {}, config = {}) => {
    try {
      const response = await client.post(endpoint, data, config);
      return response.data;
    } catch (error) {
      return toEnvelope(error, endpoint);
    }
  },

  delete: async (endpoint, config = {}) => {
    try {
      const response = await client.delete(endpoint, config);
      return response.data;
    } catch (error) {
      return toEnvelope(error, endpoint);
    }
  },
};

export default api;
