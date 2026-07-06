export function showConfirmModal(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay glass';
    
    // Create modal box
    const modal = document.createElement('div');
    modal.className = 'modal card';
    
    // Modal content
    modal.innerHTML = `
      <h3 style="color: var(--primary-color); margin-bottom: 1rem;">${title}</h3>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">${message}</p>
      <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-outline" id="btn-modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="btn-modal-confirm" style="background-color: #ef4444; border-color: #ef4444; color: white;">Confirmar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close modal function
    const closeModal = () => {
      overlay.style.animation = 'fadeOut 0.2s ease-out forwards';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    };

    // Event listeners
    document.getElementById('btn-modal-cancel')?.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    
    document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}

export function showInputModal(title: string, message: string, placeholder: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay glass';
    
    const modal = document.createElement('div');
    modal.className = 'modal card';
    
    modal.innerHTML = `
      <h3 style="color: var(--primary-color); margin-bottom: 1rem;">${title}</h3>
      <p style="color: var(--text-secondary); margin-bottom: 1rem;">${message}</p>
      <input type="text" id="modal-input-field" placeholder="${placeholder}" style="width: 100%; background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px; margin-bottom: 2rem;">
      <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-outline" id="btn-input-cancel">Cancelar</button>
        <button class="btn btn-primary" id="btn-input-confirm">Confirmar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const inputEl = document.getElementById('modal-input-field') as HTMLInputElement;
    if (inputEl) inputEl.focus();
    
    const closeModal = () => {
      overlay.style.animation = 'fadeOut 0.2s ease-out forwards';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    };

    document.getElementById('btn-input-cancel')?.addEventListener('click', () => {
      closeModal();
      resolve(null);
    });
    
    document.getElementById('btn-input-confirm')?.addEventListener('click', () => {
      closeModal();
      resolve(inputEl.value.trim() || null);
    });
  });
}
