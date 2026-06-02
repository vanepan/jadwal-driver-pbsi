'use strict';

export const APP_NAME = 'Bidang Sarana dan Prasarana Operations Platform';
export const APP_VERSION = '1.2.3';
export const RELEASE_NAME = 'Completion Tracking Expansion';

export const VERSION_HISTORY = [
  {
    version: '1.2.3',
    date: '2026-06-02',
    summary: 'Completion Tracking Expansion',
    highlights: [
      'createdBy field added to all assignment types',
      'Request-based: createdBy = requester (bidang), distinct from approvedBy (admin)',
      'Direct admin: createdBy = admin who created the assignment',
      'getAssignmentLifecycle() helper — foundation for Analytics v1.2.5',
      'validateLifecycle() — warns on out-of-order timestamps',
      'lifecycle validator added to ValidationRegistry',
      'Detail modal: "Diminta oleh" row for request-based assignments',
      'odometer fields (startOdometer, endOdometer, distanceTravelled) initialized to null on creation',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-06-02',
    summary: 'Odometer Foundation',
    highlights: [
      'KM Awal captured on Start Assignment via odometer modal',
      'KM Akhir captured on Complete Assignment via odometer modal',
      'distanceTravelled calculated automatically',
      'startOdometer, endOdometer, distanceTravelled stored in Firebase',
      'KM Awal / KM Akhir / Jarak Tempuh shown in assignment detail',
      'validateOdometer wired from Validation Engine (v1.2.1)',
      'Stacked modal UX — detail modal stays visible during input',
    ],
  },
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
