import { renderDashboardView } from './views/DashboardView';
import { renderUploadView } from './views/UploadView';
import { renderGridView } from './views/GridView';

export function navigateTo(view: 'dashboard' | 'upload' | 'grid', param?: any) {
  const container = document.getElementById('view-container');
  if (!container) return;
  
  // Update sidebar active states
  document.querySelectorAll('.sidebar nav a').forEach(el => {
    el.classList.remove('active');
    if ((el as HTMLAnchorElement).dataset.view === view) {
      el.classList.add('active');
    }
  });

  if (view === 'upload') renderUploadView(container);
  else if (view === 'dashboard') renderDashboardView(container);
  else if (view === 'grid') {
    renderGridView(container, param);
  }
}

export function initRouter() {
  // Setup sidebar listeners
  document.querySelectorAll('.sidebar nav a').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = (e.currentTarget as HTMLElement).dataset.view as any;
      if (targetView) navigateTo(targetView);
    });
  });

  document.getElementById('btn-new-import')?.addEventListener('click', () => {
    navigateTo('upload');
  });

  // Start app at dashboard
  navigateTo('dashboard');
}
