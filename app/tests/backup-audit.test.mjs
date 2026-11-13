import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/setup/21-backup-audit.sql',import.meta.url),'utf8');
const all=fs.readFileSync(new URL('../supabase/setup/00-ALL-IN-ONE.sql',import.meta.url),'utf8');
for(const fn of ['autopilot_backup','autopilot_audit_export']){
  if(!sql.includes(`function public.${fn}()`)) throw new Error(`${fn} missing`);
  if(!all.includes(`function public.${fn}()`)) throw new Error(`${fn} missing from ALL-IN-ONE`);
}
if(!sql.includes("role_name not in('owner','admin')")) throw new Error('backup role guard missing');
if(!sql.includes("role_name not in('owner','admin','auditor')")) throw new Error('audit export role guard missing');
console.log('backup/audit security checks passed');
