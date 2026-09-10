import { get, put, post, del, uploadFormData } from "./client.js";

export function getMyOrganizations() {
  return get("/organizations/my");
}

export function getAllOrganizations() {
  return get("/organizations/all");
}

export function toggleDisableOrganizationAdmin(id, disable = true) {
  return put(`/organizations/admin/${id}/toggle-disable`, { disable });
}

export function getOrganizationById(id) {
  if (!id || id === 'null' || id === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return get(`/organizations/${id}`);
}

export function updateOrganization(id, data) {
  if (!id || id === 'null' || id === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return put(`/organizations/${id}`, data);
}

export function deleteOrganization(id) {
  if (!id || id === 'null' || id === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return del(`/organizations/${id}`);
}

export function getOrgActivities(orgId, params = {}) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') {
    return Promise.resolve({ events: [] });
  }
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.page) q.set("page", params.page);
  if (params.limit) q.set("limit", params.limit);
  const qs = q.toString();
  return get(`/organizations/${orgId}/activities${qs ? `?${qs}` : ""}`);
}

export function getManagers(orgId) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') return Promise.resolve({ managers: [] });
  return get(`/organizations/${orgId}/managers`);
}

export function addManager(orgId, email) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return post(`/organizations/${orgId}/managers`, { email });
}

export function removeManager(orgId, userId) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return del(`/organizations/${orgId}/managers/${userId}`);
}

export function transferOwnership(orgId, email) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  return put(`/organizations/${orgId}/transfer-owner`, { email });
}

export function uploadOrgAvatar(id, file) {
  if (!id || id === 'null' || id === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  const formData = new FormData();
  formData.append("avatar", file);
  return uploadFormData(`/organizations/${id}/avatar`, formData);
}

export function uploadOrgCover(id, file) {
  if (!id || id === 'null' || id === 'undefined') return Promise.reject(new Error("Invalid organization ID"));
  const formData = new FormData();
  formData.append("cover", file);
  return uploadFormData(`/organizations/${id}/cover`, formData);
}

export function getOrganizationPublicProfile(orgId) {
  return get(`/organizations/${orgId}/public`);
}

export function getOrganizationPublicEvents(orgId, limit = 5) {
  return get(`/organizations/${orgId}/public/events?limit=${limit}`);
}

export function updateOrganizationPublicProfile(orgId, data) {
  return put(`/organizations/${orgId}/public`, data);
}

export function toggleFollowOrganization(orgId) {
  return post(`/organizations/${orgId}/follow`);
}

export function getPublicOrganizations() {
  return get("/organizations");
}

export function getSimilarOrganizations(orgId, limit = 4) {
  if (!orgId || orgId === 'null' || orgId === 'undefined') return Promise.resolve({ organizations: [] });
  return get(`/organizations/${orgId}/public/similar?limit=${limit}`);
}
