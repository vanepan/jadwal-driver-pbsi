/* ============================================================
   PROFILE-SERVICE.JS — Knowledge Services (V2.0.12.5)

   PURPOSE: the public surface for Organizational Knowledge Profiles —
   real since profiles/profile-engine.js, exposed through the services
   façade every future UI/consumer (e.g. V2.0.14.5's Organizational
   Profile Builder) is supposed to import from instead of reaching into
   the engine directly.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: profiles/profile-engine.js.

   NON-GOALS: no new aggregation math — explicitly NOT reimplementing
   anything profile-engine.js already computes.

   FUTURE EVOLUTION: unchanged as more PROFILE_TYPEs are added to
   profile-engine.js#PROFILE_KIND_MAP.
   ============================================================ */

'use strict';

import {
  buildProfile, listProfileTypes, PROFILE_KIND_MAP, buildAllProfiles,
} from '../profiles/profile-engine.js';

export { buildProfile, listProfileTypes, PROFILE_KIND_MAP, buildAllProfiles };
