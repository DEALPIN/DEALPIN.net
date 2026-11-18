import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const sql = fs.readFileSync(new URL('../supabase/setup/23-scale-readiness.sql', import.meta.url), 'utf8');
assert.match(sql, /autopilot_list_page/);
assert.match(sql, /dealpin_scale_probe/);
assert.match(sql, /create index if not exists/);
const store = fs.readFileSync(new URL('../js/supabase-store.js', import.meta.url), 'utf8');
assert.match(store, /autopilot_list_page/);
assert.match(store, /pageSize=500/);
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(vercel.headers));
execFileSync(process.execPath, ['tools/predeploy.js'], {cwd: root, stdio: 'ignore'});
console.log('scale readiness checks passed');
