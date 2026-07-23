/* ============================================================
   DEPARTMENT-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 3 Ch.03/Part 4 (Department — "Core, lightweight")

   firebase.js is imported LAZILY — see item-repository.js's header for why.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isDepartment } from '../contracts/department-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Create a new Department. Fails on a duplicate departmentId. */
export async function createDepartment(department) {
  if (!isDepartment(department)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'createDepartment: department does not satisfy the Department contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.departments}/${department.departmentId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `A department with id "${department.departmentId}" already exists.`);
  }
  await storeFirebaseData(`${GUDANG_PATHS.departments}/${department.departmentId}`, department);
  return success(department);
}

/** One-shot read of a single Department by id. */
export async function getDepartment(departmentId) {
  if (typeof departmentId !== 'string' || !departmentId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getDepartment: departmentId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.departments}/${departmentId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getDepartment: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No department with id "${departmentId}".`);
  return success(res.value);
}

/** All Departments, as a plain array. */
export async function listDepartments() {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.departments);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listDepartments: read failed (${res.status}).`);
  return success(Object.values(res.value || {}));
}
