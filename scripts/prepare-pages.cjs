// Prepara apenas um artefato local. Não faz deploy nem chama GitHub.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const files=['index.html','jogos.html','game.html','login.html','cadastro.html','connected.html','auth-callback.html','connected.css','connected.js','auth-callback.js'];
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('Finalize o commit antes de gerar artefato com identificação de versão.');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const folder=path.join('work','pages-'+commit.slice(0,12));fs.mkdirSync(folder,{recursive:true});
const manifest={commit,files:{}};
for(const file of files){const content=fs.readFileSync(file);fs.writeFileSync(path.join(folder,file),content);manifest.files[file]=crypto.createHash('sha256').update(content).digest('hex');}
fs.writeFileSync(path.join(folder,'.nojekyll'),'');fs.writeFileSync(path.join(folder,'version.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Artefato estático local preparado:',folder);console.log('Nenhum deploy executado. Commit:',commit);
