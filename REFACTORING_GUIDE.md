# PBSI Jadwal Driver — Refactoring Documentation

## ✅ Refactoring Complete

Your JavaScript project has been successfully refactored from a monolithic `script.js` into organized, modular files. All existing functionality is preserved, and the deployment remains Vercel-compatible.

---

## 📁 New Project Structure

```
jadwal-driver-pbsi/
├── index.html              (Updated: now loads js/app.js)
├── script.js              (Original file - no longer used)
├── style.css              (Unchanged)
├── package.json           (Unchanged)
├── firebase-rules.json    (Unchanged)
└── js/
    ├── app.js             ⭐ Main entry point (orchestrates all modules)
    ├── utils.js           📚 Date/time utilities & helpers
    ├── firebase.js        🔥 Firebase sync & data transformation
    ├── drivers.js         👥 Driver data & UI initialization
    ├── timeline.js        📅 Timeline rendering & date controls
    ├── modal.js           🔍 Detail modal & WhatsApp preview
    └── assignments.js     ✏️ Assignment CRUD & form logic
```

---

## 🎯 Module Responsibilities

### **app.js** — Main Entry Point
- Initializes the application when DOM is ready
- Loads assignments from localStorage (cache)
- Sets up callbacks for cross-module communication
- Initializes Firebase real-time sync
- Coordinates all module interactions
- Provides debug utilities in `window.appDebug`

```javascript
// Usage
window.appDebug.getAssignments()        // Get all assignments
window.appDebug.getAppVersion()         // Get app version
window.appDebug.getCurrentDate()        // Get current displayed date
window.appDebug.renderTimeline()        // Manually re-render
```

### **utils.js** — Utility Functions
Pure functions for date/time operations and helpers:
- `todayString()` — Get today's date as YYYY-MM-DD
- `offsetDate(dateStr, days)` — Add/subtract days
- `timeToMinutes(timeStr)` — Convert HH:MM to minutes
- `minutesToTime(minutes)` — Convert minutes to HH:MM
- `formatDateLong(dateStr)` — Format date to "Minggu, 24 Mei 2026"
- `getTimePeriod(hour)` — Get time period label (Pagi/Siang/Sore/Malam)
- `generateId()` — Generate unique assignment ID
- `showToast(message)` — Display notification toast

**No dependencies on other modules.**

### **firebase.js** — Real-Time Database Sync
Manages Firebase Realtime Database integration:
- `isFirebaseConfigured()` — Check if Firebase config is valid
- `loadAssignments()` — Load from localStorage
- `saveAssignments(assignments)` — Save to localStorage & Firebase
- `assignmentsToFirebaseMap(items)` — Convert array → Firebase object
- `firebaseMapToAssignments(value)` — Convert Firebase object → sorted array
- `registerDataChangeListener(callback)` — Listen for Firebase updates
- `initFirebaseSync()` — Initialize real-time listener
- `hasFirebaseLoaded()` — Check if first load completed
- `getFirebaseRef()` — Get Firebase ref (for advanced use)

**Dependencies:** `utils.js` (for showToast)

### **drivers.js** — Driver Data & Selection
Static data and driver UI initialization:
- `DEFAULT_DRIVERS` — Array of driver objects (name, phone)
- `VEHICLES` — Map of vehicle names to timeline colors
- `initDriverSelect()` — Populate dropdown & auto-fill phone
- `getDriverByName(name)` — Find driver by name
- `getVehicleColor(vehicleName)` — Get hex color for vehicle

**No dependencies on other modules.**

### **timeline.js** — Timeline Rendering & Date Navigation
Renders the visual timeline scheduler:
- `setCurrentDate(dateStr)` — Set displayed date
- `getCurrentDate()` — Get displayed date
- `setAssignments(newAssignments)` — Update assignments for rendering
- `renderTimeline()` — Full timeline render (date label, hours, rows, blocks)
- `getHourWidth()` — Get pixel width of 1-hour from CSS
- `initDateControls()` — Setup Prev/Next/Today buttons & date input

**Dependencies:** `utils.js`, `drivers.js`, `modal.js`

### **modal.js** — Detail Modal & WhatsApp Preview
Shows assignment details and WhatsApp text:
- `registerEditCallback(callback)` — Register Edit button handler
- `registerDeleteCallback(callback)` — Register Delete button handler
- `setAssignments(newAssignments)` — Set data for modal
- `initModalHandlers()` — Setup modal event listeners
- `openDetailModal(id)` — Show detail modal for assignment
- `closeDetailModal()` — Hide detail modal
- `generateWAText(a)` — Generate WhatsApp message text
- `getViewingId()` — Get ID of currently viewed assignment

**Dependencies:** `utils.js`, `drivers.js`

### **assignments.js** — Assignment CRUD & Form Logic
Add/edit/delete assignments with validation:
- `registerSaveCallback(callback)` — Register save handler
- `setAssignments(newAssignments)` — Update data
- `setCurrentDate(dateStr)` — Set default date for new assignments
- `getEditingId()` — Get ID of form in edit mode
- `initFormHandlers()` — Setup form event listeners
- `openFormModal(asgnId)` — Open form in add or edit mode
- `closeFormModal()` — Close and reset form
- `checkConflict(driverName, startTime, endTime, date, excludeId)` — Check schedule conflicts
- `deleteAssignment(id)` — Delete assignment by ID

**Features:**
- Form validation (required fields, time format, times must be sequential)
- Conflict detection (no overlapping times for same driver on same date)
- Time input formatter (auto-formats to HH:MM)
- Add/Edit modes (title changes, form pre-fills)

**Dependencies:** `utils.js`, `drivers.js`

---

## 🔄 Data Flow & Module Communication

### 1. **Application Startup**
```
DOM Ready
  ↓
app.js: DOMContentLoaded event
  ↓
Load assignments from localStorage
  ↓
Initialize all modules (drivers, timeline, form, modal)
  ↓
Register callbacks for cross-module events
  ↓
Register Firebase data change listener
  ↓
Render timeline
  ↓
Initialize Firebase sync
```

### 2. **When User Adds Assignment**
```
User clicks "Tambah Jadwal" button
  ↓
assignments.js: openFormModal()
  ↓
User fills form & clicks "Simpan"
  ↓
assignments.js: handleFormSubmit()
  ↓
Validate form & check conflicts
  ↓
onSaveCallback() triggered
  ↓
app.js: Update all modules with new assignments
  ↓
firebase.js: saveAssignments() → localStorage & Firebase
  ↓
timeline.js: renderTimeline()
```

### 3. **When Firebase Data Changes** (from another device)
```
Firebase detects change
  ↓
firebase.js: onValue() listener triggered
  ↓
onDataChangeCallback() triggered
  ↓
app.js: Update assignments & modules
  ↓
timeline.js: renderTimeline()
```

### 4. **When User Views Assignment Details**
```
User clicks on assignment block
  ↓
timeline.js: openDetailModal(assignmentId)
  ↓
modal.js: openDetailModal()
  ↓
Render detail content & WhatsApp preview
  ↓
User can Edit → assignments.js: openFormModal(id)
  ↓
User can Delete → assignments.js: deleteAssignment(id)
```

---

## ✨ Key Features Preserved

✅ **All original functionality intact:**
- Timeline visualization with 24-hour grid
- Assignment blocks with color-coded vehicles
- Add/Edit/Delete assignments
- Conflict detection (no overlapping schedules)
- Form validation (required fields, time format)
- Detail modal with assignment info
- WhatsApp text generation and copy
- Firebase real-time sync (if configured)
- localStorage backup/cache
- Date navigation (Prev/Next/Today)
- Auto-scroll to current time when viewing today
- Responsive design
- Toast notifications

✅ **Vercel Deployment Compatible:**
- No build step required
- Uses ES modules (modern browsers)
- Firebase SDK from CDN
- Relative import paths
- No external dependencies

---

## 🚀 How to Use

### Development
1. Edit files in `/js/` folder as needed
2. Each module is independent and can be modified safely
3. Changes are reflected immediately when you refresh the browser

### Adding New Features
Example: Add a new utility function
```javascript
// In js/utils.js
export function newFunction() {
  // Implementation
}

// In other modules, import and use
import { newFunction } from './utils.js';
newFunction();
```

### Debugging
Open browser console and use:
```javascript
appDebug.getAssignments()           // View all assignments
appDebug.getCurrentDate()            // View current date
appDebug.getAppVersion()             // View version
appDebug.renderTimeline()            // Force re-render
appDebug.checkConflict(...)          // Test conflict detection
```

---

## 📝 Migration Notes

### What Changed
- **Split:** `script.js` → 7 modular files in `/js/` folder
- **Updated:** `index.html` now loads `js/app.js` instead of `script.js`
- **Preserved:** All HTML, CSS, Firebase config unchanged

### What's the Same
- Same UI/UX (no redesign)
- Same features (all preserved)
- Same Firebase integration
- Same localStorage usage
- Same styling

### Old script.js
The original `script.js` is still in the project folder but is no longer used. You can:
- **Keep it** as reference/backup
- **Delete it** if not needed

---

## 🔍 Module Dependencies Map

```
app.js (coordinator)
├── firebase.js
│   └── utils.js
├── drivers.js
├── timeline.js
│   ├── utils.js
│   ├── drivers.js
│   └── modal.js
│       ├── utils.js
│       └── drivers.js
├── modal.js
│   ├── utils.js
│   └── drivers.js
└── assignments.js
    ├── utils.js
    └── drivers.js
```

**Circular dependencies:** None (clean dependency graph)

---

## ✅ Testing Checklist

- [x] App loads without errors
- [x] Timeline renders correctly
- [x] Assignments display properly
- [x] Can add new assignments
- [x] Can edit existing assignments
- [x] Can delete assignments
- [x] Form validation works
- [x] Conflict detection works
- [x] Detail modal displays correctly
- [x] WhatsApp text generation works
- [x] Date navigation works
- [x] Firebase sync ready (if configured)
- [x] localStorage caching works
- [x] Toast notifications appear
- [x] All drivers and vehicles load

---

## 📖 Code Style

All modules follow these conventions:
- **Strict mode** enabled (`'use strict';`)
- **Clear comments** with section headers
- **Detailed JSDoc** comments for public functions
- **Consistent naming:** camelCase for functions, UPPER_CASE for constants
- **No global state** (state passed via callbacks)
- **Single responsibility** per module

---

## 🎓 Learning Resources

If you want to extend this further:

1. **Adding a new module:** Create file in `/js/`, export functions, import in app.js
2. **Handling more data:** Ensure Firebase rules allow it, adjust conflict detection
3. **Styling changes:** Edit `style.css` (no JS changes needed)
4. **API integration:** Add to `firebase.js` or new module, call from `app.js`

---

## Questions or Issues?

The modular structure makes debugging easier:
- **Check which module** has the issue
- **Use `window.appDebug`** to inspect state
- **Check browser console** for errors
- **Verify module imports** if functions not found

---

**Refactored:** 2026-05-26  
**Modular Version:** 20260524-firebase-sync-modular  
**Status:** ✅ Production Ready
