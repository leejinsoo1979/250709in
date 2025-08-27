#!/usr/bin/env node
const { execSync } = require('node:child_process');
function run(cmd){ execSync(cmd,{stdio:'inherit'}); }
try{
  run('git add -A'); // 신규/수정/삭제 모두 스테이징
  const msg = `chore: checkpoint ${new Date().toISOString()}`;
  run(`git commit -m "${msg}"`);
}catch(e){
  console.log('No changes to commit.');
}