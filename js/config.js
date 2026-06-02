'use strict';

export const APP_NAME = 'Bidang Sarana dan Prasarana Operations Platform';
export const APP_VERSION = '1.2.1';
export const RELEASE_NAME = 'Validation Engine Foundation';

export const VERSION_HISTORY = [
  {
    version: '1.2.1',
    date: '2026-06-02',
    summary: 'Validation Engine Foundation',
    highlights: [
      'Centralized Validation Engine (js/validation.js)',
      'ValidationRegistry — extensible validator dispatch',
      'Request, Assignment, Driver, Vehicle, User validators',
      'Odometer Validator foundation (not yet active)',
      'Multi Day + Full Day combination support',
      'Full Day: time inputs dimmed instead of hidden',
      'WA Copy: bold title + PIC in header',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-31',
    summary: 'Mobile UX Refresh & Schedule Navigation Improvement',
    highlights: [
      'Navigation redesign with collapsible sidebar',
      'Horizontal timeline mouse-wheel scrolling',
      'Mobile bottom navigation',
      'Centralized version management',
      'Enterprise-grade header redesign',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-01',
    summary: 'Initial release',
    highlights: [
      'Driver schedule management',
      'Request workflow (bidang → admin)',
      'Firebase real-time sync',
      'Telegram push notifications',
    ],
  },
];
