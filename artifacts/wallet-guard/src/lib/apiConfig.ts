/**
 * Runtime API / Socket.io configuration.
 *
 * In both development and production, Replit's proxy routes
 * /api-server/* → api-server on port 8080 (stripping the prefix).
 *
 * Development: Vite dev server proxy
 * Production:  Replit deployment proxy (same routing, same paths)
 *
 * We always use relative paths — no hardcoded ports needed.
 */

/** Base URL for REST calls — no trailing slash. */
export const API_BASE = "/api-server/api";

/** Socket.io connection URL — empty string = connect to same origin. */
export const SOCKET_URL = "";

/** Socket.io path on the server. */
export const SOCKET_PATH = "/api-server/socket.io";
