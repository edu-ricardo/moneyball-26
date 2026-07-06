import { fetchImports, deleteImport } from '../api/client';
import { navigateTo } from '../router';
import { showToast } from '../utils/toast';
import { showConfirmModal } from '../utils/modal';

export async function renderDashboardView(container: HTMLElement) {
  container.innerHTML = `<h2 style="color: var(--primary-color);">Bases Importadas</h2><p>Carregando...</p>`;
  
  try {
    const imports = await fetchImports();
    
    if (imports.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <h2 style="margin-bottom: 1rem; color: var(--primary-color);">Nenhuma base encontrada</h2>
          <p style="margin-bottom: 2rem; color: var(--text-secondary);">Você ainda não importou nenhum dado do Football Manager.</p>
          <button class="btn btn-primary" id="btn-empty-upload">Fazer primeira importação</button>
        </div>
      `;
      document.getElementById('btn-empty-upload')?.addEventListener('click', () => navigateTo('upload'));
      return;
    }

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">`;
    imports.forEach((imp: any) => {
      html += `
        <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s;">
          <div>
            <h3 style="color: var(--primary-color); margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
              ${imp.name || `Import #${imp.id}`}
              <button onclick="window.delImport(event, ${imp.id})" style="background:none; border:none; color: #ef4444; cursor:pointer; font-size: 1.2rem;" title="Deletar Importação"><i class="fa-solid fa-trash"></i></button>
            </h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.25rem;">Liga: ${imp.league || 'N/A'}</p>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.25rem;">Ano: ${imp.year || 'N/A'}</p>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem;">Objetivo: ${imp.objective || 'N/A'}</p>
            ${imp.observation ? `<div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; border-left: 2px solid var(--primary-color);">${imp.observation}</div>` : '<div style="margin-bottom: 1rem;"></div>'}
          </div>
          <button class="btn btn-outline" style="width: 100%;" onclick="window.loadGrid(${imp.id})"><i class="fa-solid fa-chart-line"></i> Analisar Dados</button>
        </div>
      `;
    });
    html += `</div>`;
    
    container.innerHTML = html;
    
    // Attach global helper for onclick
    (window as any).loadGrid = (id: number) => navigateTo('grid', id);
    (window as any).delImport = async (e: Event, id: number) => {
      e.stopPropagation();
      
      const confirmed = await showConfirmModal(
        'Confirmar Exclusão',
        'Tem certeza que deseja deletar esta base? Esta ação não pode ser desfeita.'
      );
      
      if (!confirmed) return;
      
      try {
        await deleteImport(id);
        showToast('Base deletada com sucesso', 'success');
        renderDashboardView(container); // re-render
      } catch (err: any) {
        showToast('Erro ao deletar: ' + err.message, 'error');
      }
    };

  } catch (err: any) {
    container.innerHTML = `<div class="card" style="color: red;">Erro ao carregar bases: ${err.message}</div>`;
  }
}
