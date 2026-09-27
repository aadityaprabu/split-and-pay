// The only file that reads import.meta.env. Everything else imports Environment from here.
// Vite bakes these in at build time: from frontend/.env locally, and in docker from the
// root .env values that frontend/Dockerfile maps to VITE_* names.
export const Environment = Object.freeze({
  BASE_URL: import.meta.env.VITE_BASE_URL,
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
});
