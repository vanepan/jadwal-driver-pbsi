/* file-storage-check.mjs — Node check for V2.1 "File Storage Foundation":
   real SHA-256 content hashing (Web Crypto API) and the dedup registry.
   Does NOT test file-storage-engine.js#uploadFile() directly — that
   function transitively imports js/firebase.js, which does a top-level
   `import ... from 'https://...'` that Node's default ESM loader cannot
   resolve (the exact same constraint documented in
   scripts/sarpras-workspace-completion-check.mjs for why nor-center.js is
   never statically imported there either). uploadFile()'s real behavior
   is covered by scripts/sarpras-workspace-dom-check.mjs (a real browser).
   Run: node scripts/file-storage-check.mjs   (exit 0 = pass) */

import { computeSha256 } from '../src/file-storage/file-hash.js';
import { makeStoredFileRecord, isStoredFileRecord } from '../src/file-storage/contracts/file-storage-contract.js';
import {
  registerStoredFile, getStoredFileBySha256, hasStoredFile, listStoredFiles,
  linkSessionToStoredFile, resetFileStorageRegistry,
  findOrphanedStorageFiles, validateSessionStorageIntegrity,
} from '../src/file-storage/file-storage-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetFileStorageRegistry();

console.log('\n[computeSha256 — real content hash, known test vectors]');
const helloHash = await computeSha256(new Blob(['hello']));
check('SHA-256("hello") matches the well-known test vector', helloHash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
const emptyHash = await computeSha256(new Blob([]));
check('SHA-256("") matches the well-known empty-string vector', emptyHash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const identicalA = await computeSha256(new Blob(['same content']));
const identicalB = await computeSha256(new Blob(['same content']));
check('identical content produces identical hashes (determinism)', identicalA === identicalB);
const differentHash = await computeSha256(new Blob(['different content']));
check('different content produces different hashes', identicalA !== differentHash);

console.log('\n[StoredFileRecord contract]');
const record = makeStoredFileRecord({ sha256: helloHash, originalFilename: 'hello.txt', mimeType: 'text/plain', sizeBytes: 5, storagePath: `sarpras-intelligence/engineering/${helloHash}` });
check('makeStoredFileRecord produces a valid StoredFileRecord', isStoredFileRecord(record));
check('id is deterministic from sha256', record.id === `file:${helloHash}`);
check('isStoredFileRecord rejects a non-hex sha256', !isStoredFileRecord({ ...record, sha256: 'not-a-hash' }));

console.log('\n[Dedup registry — never store identical content twice]');
registerStoredFile(record);
check('registerStoredFile stores the record', hasStoredFile(helloHash));
check('getStoredFileBySha256 retrieves it', getStoredFileBySha256(helloHash).id === record.id);
check('a duplicate upload would be recognized before any upload call', hasStoredFile(helloHash) === true);

const linked1 = linkSessionToStoredFile(helloHash, 'import-session:engineering:1:1');
check('linkSessionToStoredFile records the first reuse', linked1.linkedSessionIds.includes('import-session:engineering:1:1'));
const linked2 = linkSessionToStoredFile(helloHash, 'import-session:engineering:1:2');
check('a second session referencing the same content is also recorded (no re-upload, no data loss)', linked2.linkedSessionIds.length === 2);
const linkedAgain = linkSessionToStoredFile(helloHash, 'import-session:engineering:1:1');
check('re-linking the same session id is idempotent (no duplicate entries)', linkedAgain.linkedSessionIds.length === 2);
check('linkSessionToStoredFile on an unknown sha256 returns null', linkSessionToStoredFile('0'.repeat(64), 'x') === null);

check('listStoredFiles returns exactly the one registered file', listStoredFiles().length === 1);

console.log('\n[V2.1.2 Part H — Storage Hardening: orphan protection + integrity validation]');
const orphansNone = findOrphanedStorageFiles((id) => id === 'import-session:engineering:1:1');
check('a file with a real, existing linked session is NOT orphaned', orphansNone.length === 0);
const orphansAll = findOrphanedStorageFiles(() => false);
check('a file whose every linked session no longer exists IS flagged as orphaned', orphansAll.length === 1 && orphansAll[0].sha256 === helloHash);

const validIntegrity = validateSessionStorageIntegrity({ sha256: helloHash, storagePath: record.storagePath });
check('a session whose sha256/storagePath match the real ledger entry validates OK', validIntegrity.ok === true);
const neverUploaded = validateSessionStorageIntegrity({ sha256: null, storagePath: null });
check('a session that was never uploaded validates OK (nothing to check, not a failure)', neverUploaded.ok === true);
const mismatchedHash = validateSessionStorageIntegrity({ sha256: '1'.repeat(64), storagePath: 'some/path' });
check('a sha256 with no matching ledger entry fails validation with a real reason', mismatchedHash.ok === false && mismatchedHash.reason.includes('No StoredFileRecord'));
const mismatchedPath = validateSessionStorageIntegrity({ sha256: helloHash, storagePath: 'wrong/path' });
check('a storagePath that disagrees with the ledger fails validation with a real reason', mismatchedPath.ok === false && mismatchedPath.reason.includes('does not match'));

resetFileStorageRegistry();
check('resetFileStorageRegistry clears the ledger', listStoredFiles().length === 0);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
