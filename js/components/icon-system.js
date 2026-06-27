/* ============================================================
   ICON-SYSTEM.JS — Reusable SVG Icons (v1.18.1 Platform Design)
   
   Apple SF Symbols philosophy: outline style, currentColor,
   scalable, no PNG/emoji dependencies.
   
   Used by Fleet Dashboard, Vehicle Drawer, and future modules.
   ============================================================ */

'use strict';

// Icon definitions: { viewBox, path, strokeWidth }
const ICONS = {
  /* Fleet & Vehicles */
  'vehicle-car': {
    viewBox: '0 0 24 24',
    path: 'M4 6h16v2H4zm1 4h14v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm2-1h10v1H7zm0 8h10v1H7z',
    strokeWidth: 1.5,
  },
  'vehicle-truck': {
    viewBox: '0 0 24 24',
    path: 'M3 6h12v2H3zm0 4h12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14-1h5v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z',
    strokeWidth: 1.5,
  },
  'vehicle-ambulance': {
    viewBox: '0 0 24 24',
    path: 'M3 7h14v3H3zm0 4h14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm16-2h3v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-7h2z',
    strokeWidth: 1.5,
  },
  'vehicle-motorcycle': {
    viewBox: '0 0 24 24',
    path: 'M5 17.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm14 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM5 12.5h6l3-4h3M14 8.5l1.5-3H18M6.5 12.5 9 8.5',
    strokeWidth: 1.6,
  },
  
  /* Status */
  'status-active': {
    viewBox: '0 0 24 24',
    path: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z',
    strokeWidth: 0,
  },
  'status-inactive': {
    viewBox: '0 0 24 24',
    path: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
    strokeWidth: 0,
  },
  'status-maintenance': {
    viewBox: '0 0 24 24',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
    strokeWidth: 0,
  },
  
  /* Document Status */
  'legal-valid': {
    viewBox: '0 0 24 24',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    strokeWidth: 0,
  },
  'legal-warning': {
    viewBox: '0 0 24 24',
    path: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    strokeWidth: 0,
  },
  'legal-expired': {
    viewBox: '0 0 24 24',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5H8v-2h6v2z',
    strokeWidth: 0,
  },
  
  /* Health */
  'health-ok': {
    viewBox: '0 0 24 24',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    strokeWidth: 0,
  },
  'health-warn': {
    viewBox: '0 0 24 24',
    path: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    strokeWidth: 0,
  },
  'health-danger': {
    viewBox: '0 0 24 24',
    path: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
    strokeWidth: 0,
  },
  
  /* Actions */
  'action-edit': {
    viewBox: '0 0 24 24',
    path: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z',
    strokeWidth: 1.5,
  },
  'action-archive': {
    viewBox: '0 0 24 24',
    path: 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 15.38L6.62 9.5H17.4L12 15.38z',
    strokeWidth: 0,
  },
  'action-delete': {
    viewBox: '0 0 24 24',
    path: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z',
    strokeWidth: 0,
  },
  'action-restore': {
    viewBox: '0 0 24 24',
    path: 'M7 6.5C7 4.57 8.57 3 10.5 3S14 4.57 14 6.5c0 1.74-1.38 3.17-3.1 3.48.35.63.55 1.35.55 2.12 0 2.76-2.24 5-5 5s-5-2.24-5-5c0-1.78.93-3.33 2.33-4.21A3.488 3.488 0 0 1 7 6.5z',
    strokeWidth: 0,
  },
  'action-search': {
    viewBox: '0 0 24 24',
    path: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    strokeWidth: 0,
  },
  'action-filter': {
    viewBox: '0 0 24 24',
    path: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
    strokeWidth: 0,
  },
  'action-download': {
    viewBox: '0 0 24 24',
    path: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    strokeWidth: 0,
  },
  
  /* Navigation */
  'nav-chevron-right': {
    viewBox: '0 0 24 24',
    path: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z',
    strokeWidth: 0,
  },
  'nav-close': {
    viewBox: '0 0 24 24',
    path: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
    strokeWidth: 0,
  },
  'nav-menu': {
    viewBox: '0 0 24 24',
    path: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
    strokeWidth: 0,
  },
  
  /* Asset-strip glyphs (status / tax / insurance / maintenance / activity) */
  'doc-tax': {
    viewBox: '0 0 24 24',
    path: 'M6 2h9l3 3v17l-2.5-1.5L13 22l-2.5-1.5L8 22l-2.5-1.5L6 22V2zm3 5h6M9 11h6M9 15h4',
    strokeWidth: 1.5,
  },
  'doc-shield': {
    viewBox: '0 0 24 24',
    path: 'M12 3l7 3v5c0 4.4-3 8.4-7 9.5-4-1.1-7-5.1-7-9.5V6l7-3zm-1.5 9.5 4-4',
    strokeWidth: 1.6,
  },
  'tool-wrench': {
    viewBox: '0 0 24 24',
    path: 'M14.7 6.3a4 4 0 0 0-5.1 5.1L4 17l3 3 5.6-5.6a4 4 0 0 0 5.1-5.1l-2.3 2.3-2.1-.6-.6-2.1 2.3-2.3z',
    strokeWidth: 1.5,
  },
  'time-clock': {
    viewBox: '0 0 24 24',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3.5 2',
    strokeWidth: 1.6,
  },

  /* Info */
  'info-empty': {
    viewBox: '0 0 24 24',
    path: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    strokeWidth: 1.5,
  },
};

/** Map a vehicle TYPE key to an SVG icon name (presentation-only — replaces the
 *  emoji that lived in the type registry). Unknown types fall back to the car. */
const VEHICLE_TYPE_ICONS = {
  mobil:     'vehicle-car',
  motor:     'vehicle-motorcycle',
  ambulance: 'vehicle-ambulance',
};
export function vehicleTypeIconName(typeKey) {
  return VEHICLE_TYPE_ICONS[String(typeKey || '').toLowerCase()] || 'vehicle-car';
}

/**
 * Render an inline SVG icon.
 * @param {string} name - Icon key from ICONS
 * @param {string} [size='1.2rem'] - Size (width/height)
 * @param {string} [tone='currentColor'] - Color (var(--ok), var(--warn), etc. or 'currentColor')
 * @returns {string} SVG HTML string (escaped)
 */
export function renderIcon(name, size = '1.2rem', tone = 'currentColor') {
  const icon = ICONS[name];
  if (!icon) return '';
  
  const color = tone === 'currentColor' ? 'currentColor' : `var(${tone.startsWith('--') ? tone : '--' + tone})`;
  const numSize = parseFloat(size);
  const dimRem = numSize / 16; // assume 16px base
  
  return `<svg width="${size}" height="${size}" viewBox="${icon.viewBox}" fill="none" stroke="${color}" stroke-width="${icon.strokeWidth || 1.5}" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;"><path d="${icon.path}"/></svg>`;
}

/**
 * Get icon + text markup (inline flex).
 * @param {string} name - Icon key
 * @param {string} text - Display text
 * @param {string} [size='1rem'] - Icon size
 * @param {string} [tone='currentColor'] - Color
 * @returns {string} HTML (icon + text in flex)
 */
export function renderIconWithText(name, text, size = '1rem', tone = 'currentColor') {
  const icon = renderIcon(name, size, tone);
  return `<span style="display:inline-flex;align-items:center;gap:0.4rem;">${icon} ${text}</span>`;
}

/**
 * List available icons (for documentation/testing).
 * @returns {string[]}
 */
export function listIcons() {
  return Object.keys(ICONS);
}
