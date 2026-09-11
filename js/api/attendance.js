import { get, put, post, del, uploadFormData } from "./client.js";

export function getAttendance(eventId) {
  return get(`/attendance/events/${eventId}/attendance`);
}

export function getAttendanceStats(eventId) {
  return get(`/attendance/events/${eventId}/attendance/stats`);
}

export function markAttendance(eventId, userId, status) {
  return put(`/attendance/events/${eventId}/attendance/${userId}`, { status });
}

export function scanAttendance(eventId, code) {
  return post(`/attendance/events/${eventId}/attendance/scan`, { code, ticketCode: code });
}

export function initAttendance(eventId) {
  return post(`/attendance/events/${eventId}/attendance/init`);
}

export function importExcelAttendance(eventId, formData) {
  return uploadFormData(`/attendance/events/${eventId}/attendance/import-excel`, formData);
}

export function addParticipantsBatch(eventId, participants) {
  return post(`/attendance/events/${eventId}/participants/batch`, { participants });
}

export function updateExternalParticipant(eventId, attendanceId, data) {
  return put(`/attendance/events/${eventId}/external-participants/${attendanceId}`, data);
}

export function deleteExternalParticipant(eventId, attendanceId) {
  return del(`/attendance/events/${eventId}/external-participants/${attendanceId}`);
}

export function removeParticipant(eventId, targetId) {
  return del(`/attendance/events/${eventId}/participants/${targetId}`);
}

export function toggleOnlineCheckin(eventId, data) {
  return post(`/attendance/events/${eventId}/online-checkin/toggle`, data);
}

export function getOnlineCheckinStatus(eventId) {
  return get(`/attendance/events/${eventId}/online-checkin/status`);
}

export function verifyOnlineCheckin(eventId, code) {
  return post(`/attendance/events/${eventId}/online-checkin/verify`, { code });
}

