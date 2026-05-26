/* ============================================================
   UTILS.JS — Utility & Helper Functions
   
   Date/time converters, formatters, and general utilities.
   ============================================================ */

'use strict';

/**
 * Mengembalikan tanggal hari ini dalam format YYYY-MM-DD
 */
export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Menggeser tanggal sebanyak n hari dari tanggal yang diberikan (timezone-safe)
 * @param {string} dateStr - Format YYYY-MM-DD
 * @param {number} days - Jumlah hari untuk digeser (bisa negatif)
 * @returns {string} - Tanggal baru dalam format YYYY-MM-DD
 */
export function offsetDate(dateStr, days) {
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Konversi waktu HH:MM → menit dari tengah malam
 * @param {string} timeStr - Format HH:MM (contoh: "09:30")
 * @returns {number} - Menit dari tengah malam (contoh: 570)
 */
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Konversi menit dari tengah malam → waktu HH:MM
 * @param {number} minutes - Menit dari tengah malam (contoh: 570)
 * @returns {string} - Waktu dalam format HH:MM (contoh: "09:30")
 */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format tanggal panjang: YYYY-MM-DD → "Minggu, 24 Mei 2026"
 * @param {string} dateStr - Format YYYY-MM-DD
 * @returns {string} - Tanggal format panjang dalam Bahasa Indonesia
 */
export function formatDateLong(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Mengembalikan label waktu berdasarkan jam
 * @param {number} hour - Jam (0-23)
 * @returns {string} - Label waktu (Dini Hari, Pagi, Siang, Sore, Malam)
 */
export function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6)  return 'Dini Hari';
  if (hour >= 6 && hour < 12) return 'Pagi';
  if (hour >= 12 && hour < 15) return 'Siang';
  if (hour >= 15 && hour < 18) return 'Sore';
  return 'Malam';
}

/**
 * Generate ID unik sederhana untuk assignment
 * @returns {string} - ID unik
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Toast notification untuk feedback user
 * @param {string} message - Pesan yang ditampilkan
 */
let toastTimeout = null;
export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2800);
}
