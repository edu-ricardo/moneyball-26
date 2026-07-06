import Papa from 'papaparse';
import { createImport } from '../api/client';
import { navigateTo } from '../router';
import { showToast } from '../utils/toast';

export function renderUploadView(container: HTMLElement) {
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto; margin-top: 2rem;">
      <h2 style="margin-bottom: 1rem; color: var(--primary-color);">Nova Importação</h2>
      <p style="margin-bottom: 2rem; color: var(--text-secondary);">
        Faça o upload do arquivo CSV exportado do seu save.
      </p>

      <div class="upload-zone" id="drop-zone">
        <div class="upload-icon"><i class="fa-solid fa-file-csv"></i></div>
        <h3 id="upload-status" style="margin-bottom: 0.5rem;">Arraste e solte o CSV aqui</h3>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">ou clique para selecionar o arquivo</p>
        <button class="btn btn-primary" onclick="document.getElementById('file-input').click()">Selecionar Arquivo</button>
        <input type="file" id="file-input" accept=".csv, .html, .rtf" style="display: none;" />
      </div>
      
      <div style="margin-top: 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Nome do Import</label>
          <input type="text" id="imp-name" placeholder="Ex: Base Brasil 2026" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Liga Base</label>
          <input type="text" id="imp-league" placeholder="Ex: Brasileirão Assaí" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Ano no Jogo</label>
          <input type="number" id="imp-year" placeholder="2026" value="2026" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Objetivo / Posição</label>
          <input type="text" id="imp-obj" placeholder="Ex: Wonderkids ou Atacante Alvo" />
        </div>
      </div>
      
      <div style="margin-top: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Observação / Descrição Longa</label>
        <textarea id="imp-obs" placeholder="Adicione notas ou detalhes sobre esta base de dados..." rows="3" style="width: 100%; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; padding: 0.75rem; font-family: inherit; resize: vertical;"></textarea>
      </div>

      <div style="margin-top: 2rem; text-align: right;">
        <button class="btn btn-primary" id="btn-process">Processar Importação</button>
      </div>
    </div>
  `;

  let selectedFile: File | null = null;
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const uploadStatus = document.getElementById('upload-status');
  const btnProcess = document.getElementById('btn-process');

  const handleFile = (file: File) => {
    if (!file) return;
    selectedFile = file;
    if (uploadStatus) uploadStatus.textContent = `Arquivo Selecionado: ${file.name}`;
    dropZone?.classList.add('dragover');
  };

  fileInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) handleFile(target.files[0]);
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      if (!selectedFile) dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      // @ts-ignore
      if (e.dataTransfer?.files.length > 0) {
        // @ts-ignore
        handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  btnProcess?.addEventListener('click', () => {
    if (!selectedFile) {
      showToast("Por favor, selecione um arquivo primeiro.", "error");
      return;
    }

    const name = (document.getElementById('imp-name') as HTMLInputElement).value || selectedFile.name;
    const league = (document.getElementById('imp-league') as HTMLInputElement).value;
    const year = (document.getElementById('imp-year') as HTMLInputElement).value;
    const objective = (document.getElementById('imp-obj') as HTMLInputElement).value;
    const observation = (document.getElementById('imp-obs') as HTMLTextAreaElement).value;

    btnProcess.textContent = "Processando...";
    btnProcess.setAttribute('disabled', 'true');

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        try {
          await createImport({
            name, league, year, position_sought: objective, objective, observation,
            data: results.data
          });

          showToast('Importação concluída com sucesso!', 'success');
          navigateTo('dashboard');
        } catch (err: any) {
          showToast('Erro: ' + err.message, 'error');
        } finally {
          btnProcess.textContent = "Processar Importação";
          btnProcess.removeAttribute('disabled');
        }
      },
      error: function(err) {
        showToast('Erro ao ler CSV: ' + err.message, 'error');
        btnProcess.textContent = "Processar Importação";
        btnProcess.removeAttribute('disabled');
      }
    });
  });
}
