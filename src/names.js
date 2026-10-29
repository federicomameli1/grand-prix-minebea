export const MAX_NAME_LENGTH = 12;
export const NAME_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ' ', '-', 'delete', 'done'];
export const NAME_COLUMNS = 10;

export const sanitizeName = value => [...String(value).normalize('NFC').replace(/[^\p{L}\p{N} '-]/gu, '')].slice(0, MAX_NAME_LENGTH).join('');
export const finishName = (value, fallback) => sanitizeName(String(value).trim().replace(/\s+/g, ' ')).trim() || fallback;
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
