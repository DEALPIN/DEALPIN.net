/* Update 8: input/API hardening regression checks. */
import fs from 'fs';
const api=fs.readFileSync(new URL('../js/supabase-store.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes('js/input-validation.js')) throw new Error('input validation module not loaded');
for(const needle of ["o.body.length>262144","DealpinInput.json(data)","DealpinInput.uuid(id,'record id')","DealpinInput.action(action)"]) if(!api.includes(needle)) throw new Error('missing hardening check: '+needle);
console.log('Update 8 input/API hardening checks passed');
