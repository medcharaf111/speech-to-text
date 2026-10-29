// Shared socket.io settings. Websocket first avoids the long-polling handshake storm when
// many listeners connect at once; polling stays as a fallback for restrictive networks.
export const WS_URL = import.meta.env.VITE_APP_API_URL;

export const SOCKET_OPTS = {
  transports: ["websocket", "polling"],
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
};
