// Somente imagens raster. A autorização de escrita é conferida pelo Storage.
export function coverUploader(db, event, onSaved, onError) {
  const section = document.createElement('section'); section.className = 'cover-uploader';
  const label = document.createElement('label'); label.textContent = 'Enviar capa do celular ou computador';
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
  label.append(input);
  const help = document.createElement('p'); help.textContent = 'JPG, PNG ou WebP, até 5 MB. A capa atual só será trocada após o envio terminar.';
  const preview = document.createElement('img'); preview.hidden = true; preview.alt = 'Prévia da nova capa'; preview.style.maxWidth = '100%';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const send = document.createElement('button'); send.type = 'button'; send.textContent = 'Salvar nova capa'; send.disabled = true;
  let file = null, previewUrl = null;
  input.addEventListener('change', () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    file = input.files?.[0] || null; preview.hidden = true; send.disabled = true; status.textContent = '';
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      file = null; status.textContent = 'Escolha uma imagem JPG, PNG ou WebP de até 5 MB.'; return;
    }
    previewUrl = URL.createObjectURL(file); preview.src = previewUrl; preview.hidden = false; send.disabled = false;
  });
  send.addEventListener('click', async () => {
    if (send.disabled || !file) return;
    send.disabled = true; input.disabled = true; status.textContent = 'Enviando capa…';
    try {
      const extension = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type];
      const path = `${event.id}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await db.storage.from('event-covers').upload(path, file, { contentType:file.type, upsert:false });
      if (uploaded.error) throw uploaded.error;
      const url = db.storage.from('event-covers').getPublicUrl(path).data.publicUrl;
      const saved = await db.rpc('set_event_cover', { p_event_id:event.id, p_cover_url:url, p_expected:event.cover_url || null });
      if (saved.error) throw saved.error;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      await onSaved();
    } catch (error) { status.textContent = 'A capa não foi alterada. ' + (error.message || 'Tente novamente.'); onError(error); }
    finally { input.disabled = false; send.disabled = !file; }
  });
  section.append(label, help, preview, send, status); return section;
}
