import { get, post, patch } from "./client.js";

export function getEventCertificates(eventId) {
  return get(`/certificates/events/${eventId}/certificates`);
}

export function issueCertificates(eventId, userIds = null) {
  const body = Array.isArray(userIds) && userIds.length > 0 ? { userIds } : {};
  return post(`/certificates/events/${eventId}/certificates/issue`, body);
}

export function revokeCertificate(certId, reason) {
  return patch(`/certificates/${certId}/revoke`, { reason });
}

export function restoreCertificate(certId) {
  return patch(`/certificates/${certId}/restore`, {});
}

export function getMyCertificates() {
  return get("/certificates/mine");
}

export function verifyCertificate(code) {
  return get(`/certificates/verify/${code}`);
}
