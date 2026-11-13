import { node } from './catalogue.js';
export const groupLabel = group => `${group.name} · ${Math.max(0, group.capacity - group.active_registration_count)} de ${group.capacity} vaga(s) disponível(is)`;
export function groupManager(event, groups, save, onError) {
  const panel = node('details', undefined, 'combat-group-manager');
  panel.append(node('summary', 'Gerenciar grupos de combate'));
  panel.append(node('p', 'A capacidade total do evento continua valendo. Inscrições antigas sem grupo são preservadas. Para trocar de grupo, o jogador deve cancelar e se inscrever novamente.'));
  function form(group) {
    const form = node('form', undefined, 'combat-group-form');
    const name = node('input'); name.name = 'group_name'; name.required = true; name.maxLength = 80; name.value = group?.name || '';
    const nameLabel = node('label', group ? 'Nome do grupo' : 'Nome do novo grupo'); nameLabel.append(name);
    const capacity = node('input'); capacity.name = 'group_capacity'; capacity.type = 'number'; capacity.min = String(Math.max(1, group?.active_registration_count || 0)); capacity.max = '2147483647'; capacity.required = true; capacity.step = '1'; capacity.value = group?.capacity || '';
    const capacityLabel = node('label', 'Limite de vagas do grupo'); capacityLabel.append(capacity);
    const submit = node('button', group ? 'Salvar grupo' : 'Adicionar grupo'); submit.type = 'submit';
    form.append(nameLabel, capacityLabel, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (submit.disabled) return; submit.disabled = true;
      try { await save({ name: name.value.trim(), capacity: Number(capacity.value), id: group?.id || null }); }
      catch(error) { onError(error); }
      finally { submit.disabled = false; }
    });
    return form;
  }
  for (const group of groups) {
    const row = node('div', undefined, 'combat-group-edit'); row.append(node('h4', groupLabel(group)), form(group)); panel.append(row);
  }
  if (!groups.length) panel.append(node('p', 'Sem grupos definidos: a inscrição atual continua disponível. Ao adicionar o primeiro grupo, novas inscrições deverão escolher um grupo.'));
  panel.append(form(null)); return panel;
}
