/* ============================================================
   APP.JS — Main Application Entry Point
   
   Orchestrates all modules:
   - Initializes data from Firebase/LocalStorage
   - Sets up event listeners and callbacks
   - Manages state and re-rendering
   - Handles data synchronization
   ============================================================ */

'use strict';

// Import all modules
import { loadAssignments, saveAssignments, initFirebaseSync, registerDataChangeListener } from './firebase.js';
import { initDriverSelect } from './drivers.js';
import { renderTimeline, setCurrentDate, setAssignments as setTimelineAssignments, initDateControls, getCurrentDate } from './timeline.js';
import { initModalHandlers, registerEditCallback, registerDeleteCallback, setAssignments as setModalAssignments } from './modal.js';
import { initFormHandlers, openFormModal, closeFormModal, registerSaveCallback, setAssignments as setAssignmentsForm, setCurrentDate as setCurrentDateForm, checkConflict, deleteAssignment } from './assignments.js';

const APP_VERSION = '20260524-firebase-sync-modular';

console.info(`PBSI Scheduler ${APP_VERSION}`);

/* ── Global App State ── */
let assignments = [];

/**
 * Update all modules dengan data assignments terbaru
 * Dipanggil setiap kali ada perubahan data (Firebase sync, form submit, delete, etc)
 */
function updateAllModules() {
  setTimelineAssignments(assignments);
  setModalAssignments(assignments);
  setAssignmentsForm(assignments);
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing PBSI Scheduler app...');

  // Load assignments dari localStorage (cache lokal)
  assignments = loadAssignments();
  updateAllModules();

  // Initialize UI modules
  initDriverSelect();           // Isi dropdown driver
  initDateControls();           // Setup date navigation buttons
  initFormHandlers();           // Setup form events
  initModalHandlers();          // Setup modal events
  renderTimeline();             // Render timeline pertama kali

  // Setup callbacks untuk cross-module communication

  // ── Callback: Firebase data berubah (dari device lain) ──
  registerDataChangeListener((updatedAssignments) => {
    console.log('Firebase data updated from another device');
    assignments = updatedAssignments;
    updateAllModules();
    renderTimeline(); // Re-render timeline
  });

  // ── Callback: Form save (add/update assignment) ──
  registerSaveCallback((updatedAssignments, isNewAssignment, assignmentDate) => {
    assignments = updatedAssignments;
    updateAllModules();

    // Update current date ke tanggal assignment jika add baru
    if (isNewAssignment) {
      setCurrentDate(assignmentDate);
      setCurrentDateForm(assignmentDate);
    }

    // Save ke Firebase dan localStorage
    saveAssignments(assignments);

    // Re-render timeline
    renderTimeline();
  });

  // ── Callback: Edit button di detail modal ──
  registerEditCallback((assignmentId) => {
    openFormModal(assignmentId);
  });

  // ── Callback: Delete button di detail modal ──
  registerDeleteCallback((assignmentId) => {
    deleteAssignment(assignmentId);
    assignments = assignments.filter(a => a.id !== assignmentId);
    updateAllModules();

    // Save ke Firebase dan localStorage
    saveAssignments(assignments);

    // Re-render timeline
    renderTimeline();

    console.log(`Assignment ${assignmentId} deleted`);
  });

  // Initialize Firebase real-time sync
  // Ini akan set up listener yang update assignments saat ada perubahan di Firebase
  initFirebaseSync();

  console.log('✅ App initialized successfully');
});

// Export untuk debugging di console
window.appDebug = {
  getAssignments: () => assignments,
  getAppVersion: () => APP_VERSION,
  getCurrentDate: () => getCurrentDate(),
  checkConflict,
  renderTimeline,
};

console.info(`Jadwal Driver PBSI v${APP_VERSION} loaded`);
