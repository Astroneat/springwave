import { get, put, post } from "./client.js";

export function getEmailSettings() {
  return get("/admin/email/settings");
}

export function updateEmailSettings(settings) {
  return put("/admin/email/settings", settings);
}

export function sendTestEmail(toEmail, provider = null) {
  const body = { toEmail };
  if (provider) body.provider = provider;
  return post("/admin/email/test", body);
}
