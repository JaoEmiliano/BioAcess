import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function getBombonas() {
  return api.get("/bombonas");
}

export async function createBombona(data) {
  return api.post("/bombonas", data);
}

export async function assignRfidToBombona(bombonaId, rfidUid) {
  return api.post(`/bombonas/${bombonaId}/assign-rfid`, { rfidUid });
}

export async function assignRfidToBombonaByUid(uid, bombonaId) {
  return api.patch(`/rfids/${encodeURIComponent(uid)}/assign-bombona`, { bombonaId });
}

export async function checkoutBombona(bombonaId, payload) {
  return api.post(`/bombonas/${bombonaId}/checkout`, payload);
}

export async function checkinBombona(bombonaId, payload) {
  return api.post(`/bombonas/${bombonaId}/checkin`, payload);
}

export async function loginUser(payload) {
  return api.post("/login", payload);
}

export async function registerUser(payload) {
  return api.post("/register", payload);
}

export async function getBombona(id) {
  return api.get(`/bombonas/${id}`);
}

export async function getBombonaMovements(id, params = {}) {
  return api.get(`/bombonas/${id}/movements`, { params });
}

export async function updateBombona(bombonaId, data) {
  return api.patch(`/bombonas/${bombonaId}`, data);
}

export async function markRfidSeen(uid) {
  return api.patch(`/rfids/${encodeURIComponent(uid)}/mark-seen`);
}

export async function getUnlinkedRfids() {
  return api.get("/rfids/unlinked");
}

export async function assignRfidToBombonaByUid(uid, bombonaId) {
  return api.patch(`/rfids/${encodeURIComponent(uid)}/assign-bombona`, { bombonaId });
}

export default api;