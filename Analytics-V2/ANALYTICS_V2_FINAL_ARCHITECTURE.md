# ANALYTICS V2 FINAL ARCHITECTURE

## Sarpras Operations

### Status

Approved Architecture Baseline

This document serves as the official reference for Analytics V2 migration and implementation.

---

# OBJECTIVE

Redesign the Analytics module of Sarpras Operations to provide:

* Enterprise-grade analytics experience
* Improved operational visibility
* Better use of screen space
* Odometer-driven analytics
* Mobile and PWA readiness
* Future AI Operations Assistant compatibility

This redesign applies ONLY to the Analytics module.

---

# SHELL PROTECTION POLICY

The following components are frozen and must not be modified:

* Left Sidebar
* Top Header
* Search Bar
* Notification Area
* User Profile Area
* Theme Toggle
* Navigation Structure
* Routing Structure

Analytics V2 must render only inside the existing Analytics content container.

No redesign outside Analytics is permitted.

---

# DESIGN PRINCIPLES

Analytics V2 should feel:

* Clean
* Premium
* Professional
* Enterprise-grade
* Modern SaaS

Inspired by:

* Apple
* Linear
* Stripe Dashboard
* Vercel
* Notion

Avoid:

* Gaming aesthetics
* Neon effects
* Excessive gradients
* Excessive glassmorphism
* Flashy animations

---

# VISUAL REFINEMENTS

Typography:

* Archivo 700 for headings
* Manrope for content
* JetBrains Mono for KPI numbers

Spacing:

* 8px baseline grid
* 24px card padding
* 48px section spacing
* 12px gutters

Cards:

* Subtle 1px borders
* Minimal shadows
* Clean hierarchy

Charts:

* Thin strokes
* Minimal gridlines
* No inner shadows
* Data-first presentation

Colors:

* PBSI Red remains brand accent
* Indigo becomes Analytics accent
* Neutral palette for supporting UI

---

# THEME STRATEGY

Must fully support:

* Dark Mode
* Light Mode

Requirements:

* No hardcoded colors
* Use existing theme architecture
* Theme switching must work automatically
* Charts must adapt to both themes

---

# CSS ISOLATION STRATEGY

Analytics V2 must use:

analytics-v2.css

Requirements:

* Scoped under .analytics-scope
* Dedicated variables using --ana-* namespace
* No global selector pollution
* No modification of existing shell styles

Example:

.analytics-scope {}
--ana-primary
--ana-surface
--ana-border

Purpose:

* Prevent conflicts
* Simplify rollback
* Improve maintainability

---

# ODOMETER FOUNDATION

Distance analytics are first-class operational metrics.

The architecture must support:

* Driver Distance Analytics
* Vehicle Distance Analytics
* Bidang Distance Analytics
* Cost Analytics
* Maintenance Analytics
* Predictive Maintenance
* AI Operations Assistant

Distance aggregation logic should be reusable.

---

# MOBILE & PWA REQUIREMENTS

Analytics V2 must be optimized for:

* iPhone Safari
* Android Chrome
* Tablet Portrait
* Tablet Landscape
* Installed PWA Mode
* Desktop

Mobile requirements:

* 2-column KPI layout
* Stacked charts
* Sticky filters
* 44px touch targets
* No horizontal scrolling

Charts:

Desktop:

* Side-by-side

Mobile:

* Vertical stacking

Tables:

Desktop:

* Tables allowed

Mobile:

* Convert to cards or lists

---

# IMPLEMENTATION PHASES

Phase 1
Foundation + KPI Overview

Scope:

* CSS isolation
* Theme integration
* KPI redesign
* Visual refinement

Phase 2
Executive Charts

Scope:

* Assignment Trend
* Status Distribution

Phase 3
Driver Analytics

Scope:

* Driver workload
* Driver utilization

Phase 4
Vehicle Analytics

Scope:

* Vehicle utilization
* Vehicle workload

Phase 5
Distance & Odometer Analytics

Scope:

* Driver distance
* Vehicle distance
* Bidang distance

Phase 6
Operational Insights

Scope:

* Operational highlights
* Utilization insights
* Workload insights

Phase 7
AI Operations Assistant Placeholder

Scope:

* Reserved integration area
* Future AI compatibility

---

# FEATURE FLAG STRATEGY

Analytics V2 must be behind a feature flag.

Example:

ENABLE_ANALYTICS_V2

Requirements:

* Easy rollback
* Parallel validation
* Safe deployment

---

# ROLLBACK STRATEGY

Analytics V2 must be removable without affecting:

* Driver Operations
* Timeline Board
* Administration Workspace
* Authentication
* Notifications
* Existing Analytics V1

Rollback should require only:

* Feature flag disable
  or
* analytics-v2.css removal

---

# FUTURE ROADMAP COMPATIBILITY

Analytics V2 must remain compatible with:

* PWA Foundation
* Analytics Foundation
* AI Operations Assistant
* Cost Analytics
* Maintenance Prediction
* Engineering Module

Architecture decisions should minimize future refactoring.

---

# FINAL DECISION

Analytics V2 is approved as:

* Mobile-first
* PWA-ready
* Odometer-centric
* Theme-compatible
* Enterprise-grade
* Future AI-ready

All future implementation work should follow this document.
