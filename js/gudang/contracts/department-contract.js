/* ============================================================
   DEPARTMENT-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 3 Ch.03 (Department — "who consumed or holds
   something, referenced by Movement and Analytics")

   PURPOSE: fix the shape of a Department. Like Location, deliberately
   lightweight — a name Movement and Analytics point at, never a business
   rule of its own.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const DEPARTMENT_SCHEMA = 'gudang.department@1';

/**
 * @typedef {Object} Department
 * @property {string} departmentId
 * @property {string} name
 * @property {string} createdAt
 */

/** @param {{departmentId:string, name:string}} seed
 *  @returns {Department} */
export function makeDepartment({ departmentId, name }) {
  if (typeof departmentId !== 'string' || !departmentId) throw new Error('makeDepartment: departmentId is required.');
  if (typeof name !== 'string' || !name) throw new Error('makeDepartment: name is required.');
  return Object.freeze({ departmentId, name, createdAt: new Date().toISOString() });
}

/** @param {*} department @returns {boolean} */
export function isDepartment(department) {
  return !!department && typeof department === 'object'
    && typeof department.departmentId === 'string' && department.departmentId.length > 0
    && typeof department.name === 'string' && department.name.length > 0
    && typeof department.createdAt === 'string' && department.createdAt.length > 0;
}
