import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const detailPanelSource = readFileSync(
  new URL('../src/features/store-audits/components/ServiceCrewCctvAuditDetailPanel.tsx', import.meta.url),
  'utf8',
);

const pageSource = readFileSync(
  new URL('../src/features/store-audits/pages/StoreAuditsPage.tsx', import.meta.url),
  'utf8',
);

test('editable SCC customer service criteria uses a desktop right-aligned star layout', () => {
  assert.match(detailPanelSource, /md:flex-row md:items-center md:justify-between/);
});

test('SCC panel header keeps branch plus status together while the hero banner still shows branch on its own line', () => {
  assert.match(pageSource, /selectedAudit\.branch_name \|\| selectedAudit\.company\?\.name \|\| selectedAudit\.id/);
  assert.match(pageSource, /<span aria-hidden="true">&bull;<\/span>/);
  assert.match(pageSource, /selectedAuditStatusMeta\??\.text/);
  assert.match(detailPanelSource, /\{branchLabel\}/);
  assert.doesNotMatch(detailPanelSource, /<span aria-hidden="true">&bull;<\/span>/);
});

test('SCC employee name display trims any leading identifier before a hyphen', () => {
  assert.match(detailPanelSource, /split\('-'\)/);
  assert.match(detailPanelSource, /parts\.slice\(1\)\.join\('-'\)\.trim\(\)/);
});
