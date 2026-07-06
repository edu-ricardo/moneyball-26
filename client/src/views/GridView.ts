import * as echarts from 'echarts';
import { fetchPlayers, fetchScatterData } from '../api/client';
import { navigateTo } from '../router';
import { showToast } from '../utils/toast';
import { showConfirmModal, showInputModal } from '../utils/modal';

// Maintain state outside of the render function so re-renders remember it
let currentPage = 1;
let currentLimit = 50;
let currentSortBy = 'id';
let currentSortOrder: 'ASC' | 'DESC' = 'ASC';
let scatterMode: 'global' | 'page' = 'global';
let currentFilters: any[] = [];
let globalColumns: string[] = [];
let hiddenColumns: string[] = [];
let columnAliases: Record<string, string> = {};
let columnFormats: Record<string, 'default' | 'percent' | 'decimal'> = {};
let orderedColumns: string[] = [];
let calculatedFields: string[] = [];
let selectedPlayersData: any[] = [];

declare global {
  interface Window {
    myChart: echarts.ECharts | null;
    globalScatterData: any[];
    lastPaginatedData: any[];
    toggleScatterMode: () => void;
    updateScatterAxes: () => void;
    handleSort: (col: string, id: number) => void;
    changePage: (newPage: number, id: number) => void;
    backToDash: () => void;
    delImport: (e: Event, id: number) => void;
    loadGrid: (id: number) => void;
    openPlayerDrawer: (index: number) => void;
    closePlayerDrawer: () => void;
    updateRadarAttributes: () => void;
    radarMyChart: echarts.ECharts | null;
    currentRadarPlayerIndex: number;
    addFilter: () => void;
    removeFilter: (index: number) => void;
    applyFilters: (id: number) => void;
    openViewConfigModal: () => void;
    closeViewConfigModal: () => void;
    handleDragStart: (e: DragEvent, type: string, value: string) => void;
    handleDropFormula: (e: DragEvent) => void;
    handleDragOver: (e: DragEvent) => void;
    clearFormula: () => void;
    saveCalculatedField: (id: number) => void;
    showToast: (msg: string, type: 'success' | 'error') => void;
    filterRadarMetrics: (query: string) => void;
    saveRadarGabarito: () => void;
    loadRadarGabarito: (name: string) => void;
    refreshGabaritosDropdown: () => void;
    toggleColumnVisibility: (col: string) => void;
    moveColumnUp: (col: string) => void;
    moveColumnDown: (col: string) => void;
    setColumnAlias: (col: string, alias: string) => void;
    setColumnFormat: (col: string, format: string) => void;
    deleteCustomColumn: (id: number, col: string) => void;
    handleColDragStart: (e: DragEvent, col: string) => void;
    handleColDrop: (e: DragEvent, targetCol: string) => void;
    handleColDragOver: (e: DragEvent) => void;
    togglePlayerSelection: (e: Event, index: number) => void;
    openComparisonDrawer: () => void;
    updateComparisonRadarAttributes: () => void;
    filterConfigColumns: (q: string) => void;
    toggleAllColumns: (show: boolean) => void;
    saveCurrentView: () => void;
    loadSavedView: () => void;
    deleteSavedView: () => void;
    refreshSavedViewsList: () => void;
  }
}

export async function renderGridView(container: HTMLElement, importId: number, isReRender = false) {
  if (!isReRender) {
    // Reset state on first load
    currentPage = 1;
    currentSortBy = 'id';
    currentSortOrder = 'ASC';
    scatterMode = 'global';
    currentFilters = [];
    globalColumns = [];
    container.innerHTML = `<h2 style="color: var(--primary-color);">Analisando Base #${importId}</h2><p>Carregando dados...</p>`;
  } else {
    // Update just the table part if possible, or show a loading indicator
    const tableContainer = document.getElementById('table-wrapper');
    if (tableContainer) tableContainer.innerHTML = '<p style="text-align:center; padding: 2rem;">Carregando página...</p>';
  }
  
  try {
    const [paginatedRes, scatterData] = await Promise.all([
      fetchPlayers(importId, currentPage, currentLimit, currentSortBy, currentSortOrder, currentFilters),
      !isReRender ? fetchScatterData(importId, currentFilters) : Promise.resolve(null)
    ]);
    
    const players = paginatedRes.data;
    const pagination = paginatedRes.pagination;
    calculatedFields = paginatedRes.calculatedFields || [];
    
    if (globalColumns.length === 0 && players.length > 0) {
      globalColumns = Object.keys(players[0] || {}).filter(k => k !== 'id');
      
      // Load configuration from local storage on first load
      try {
        const savedConfig = localStorage.getItem(`grid_config_${importId}`);
        if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          if (parsed.orderedColumns) orderedColumns = parsed.orderedColumns;
          if (parsed.hiddenColumns) hiddenColumns = parsed.hiddenColumns;
          if (parsed.columnAliases) columnAliases = parsed.columnAliases;
          if (parsed.columnFormats) columnFormats = parsed.columnFormats;
        }
      } catch (e) {
        console.error('Failed to load grid config', e);
      }
    }
    
    // Always reconcile orderedColumns with globalColumns to ensure no missing or deleted fields
    const missing = globalColumns.filter(c => !orderedColumns.includes(c));
    const valid = orderedColumns.filter(c => globalColumns.includes(c));
    orderedColumns = [...valid, ...missing];
    
    // Save current config to localStorage
    if (globalColumns.length > 0) {
      localStorage.setItem(`grid_config_${importId}`, JSON.stringify({
        orderedColumns,
        hiddenColumns,
        columnAliases,
        columnFormats
      }));
    }
    
    const columns = orderedColumns;
    const displayColumns = columns.filter(c => !hiddenColumns.includes(c));

    // Format Helper
    const formatValue = (col: string, val: any) => {
      if (val === null || val === undefined || val === '') return '-';
      const format = columnFormats[col];
      if (!format || format === 'default') return val;
      
      const num = Number(val);
      if (isNaN(num)) return val;
      
      if (format === 'percent') {
        return num.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
      } else if (format === 'decimal') {
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return val;
    };

    // Build Table
    let tableHtml = '';
    
    if (players.length === 0) {
      tableHtml = `<div class="card" style="text-align: center; margin-top: 1.5rem;"><p>Nenhum jogador encontrado com os filtros atuais.</p></div>`;
    } else {
      // Sort Icon Helper
      const getSortIcon = (col: string) => {
        if (currentSortBy !== col) return '<i class="fa-solid fa-sort" style="opacity: 0.3; margin-left: 0.5rem;"></i>';
        return currentSortOrder === 'ASC' ? '<i class="fa-solid fa-sort-up" style="margin-left: 0.5rem;"></i>' : '<i class="fa-solid fa-sort-down" style="margin-left: 0.5rem;"></i>';
      };

      tableHtml = `
        <div class="card" style="margin-top: 1.5rem;">
          <div style="overflow-x: auto; width: 100%; padding-bottom: 0.5rem;" id="table-wrapper">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <th style="padding: 0.75rem; width: 40px; text-align: center;">✓</th>
                  ${displayColumns.map(col => `
                    <th 
                      draggable="true"
                      ondragstart="window.handleColDragStart(event, '${col}')"
                      ondragover="window.handleColDragOver(event)"
                      ondrop="window.handleColDrop(event, '${col}')"
                      style="padding: 0.75rem; color: var(--primary-color); white-space: nowrap; cursor: grab; user-select: none;"
                      onclick="window.handleSort('${col}', ${importId})"
                      title="Clique para ordenar, arraste para reordenar"
                    >
                      ${columnAliases[col] || col} ${getSortIcon(col)}
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${players.map((p: any, index: number) => {
                  const isSelected = selectedPlayersData.some(sp => sp.id === p.id);
                  return `
                  <tr style="border-bottom: 1px solid var(--border-color); transition: background-color 0.2s; cursor: pointer; ${isSelected ? 'background-color: rgba(168, 85, 247, 0.1);' : ''}" 
                      onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                      onmouseout="this.style.backgroundColor='${isSelected ? 'rgba(168, 85, 247, 0.1)' : 'transparent'}'"
                      onclick="window.openPlayerDrawer(${index})"
                  >
                    <td style="padding: 0.75rem; text-align: center;" onclick="window.togglePlayerSelection(event, ${index})">
                      <input type="checkbox" ${isSelected ? 'checked' : ''} style="cursor: pointer; transform: scale(1.2);">
                    </td>
                    ${displayColumns.map(col => `<td style="padding: 0.75rem; white-space: nowrap;">${formatValue(col, p[col])}</td>`).join('')}
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
            <div>
              <span style="color: var(--text-secondary);">Página ${pagination.page} de ${pagination.totalPages}</span>
              <span style="color: var(--text-secondary); margin-left: 1rem;">(Total: ${pagination.total} jogadores)</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-outline" onclick="window.changePage(${currentPage - 1}, ${importId})" ${currentPage <= 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Anterior</button>
              <button class="btn btn-primary" onclick="window.changePage(${currentPage + 1}, ${importId})" ${currentPage >= pagination.totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Próxima</button>
            </div>
          </div>
        </div>
      `;
    }
    
    // Filter Bar HTML
    let filtersHtml = `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; color: var(--text-primary);">Filtros Avançados</h3>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            ${selectedPlayersData.length >= 2 ? `<button class="btn btn-outline" style="border-color: #a855f7; color: #a855f7;" onclick="window.openComparisonDrawer()"><i class="fa-solid fa-code-compare"></i> Comparar ${selectedPlayersData.length} Jogadores</button>` : ''}
            <button class="btn btn-outline" onclick="window.openViewConfigModal()"><i class="fa-solid fa-gear"></i> Configurar Visão</button>
            <button class="btn btn-outline" onclick="window.addFilter()"><i class="fa-solid fa-plus"></i> Filtro</button>
            <button class="btn btn-primary" onclick="window.applyFilters(${importId})">Aplicar</button>
          </div>
        </div>
        <div id="filters-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${currentFilters.length === 0 ? '<p style="color: var(--text-secondary); font-size: 0.9rem;">Nenhum filtro aplicado. Mostrando todos os jogadores.</p>' : ''}
          ${currentFilters.map((f, i) => `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <select class="filter-col" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; flex-grow: 1;">
                ${columns.map(c => `<option value="${c}" ${f.col === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              <select class="filter-op" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; width: 100px;">
                <option value="=" ${f.op === '=' ? 'selected' : ''}>Igual</option>
                <option value="!=" ${f.op === '!=' ? 'selected' : ''}>Diferente</option>
                <option value=">" ${f.op === '>' ? 'selected' : ''}>Maior</option>
                <option value="<" ${f.op === '<' ? 'selected' : ''}>Menor</option>
                <option value=">=" ${f.op === '>=' ? 'selected' : ''}>Maior/Igual</option>
                <option value="<=" ${f.op === '<=' ? 'selected' : ''}>Menor/Igual</option>
                <option value="LIKE" ${f.op === 'LIKE' ? 'selected' : ''}>Contém</option>
              </select>
              <input type="text" class="filter-val" value="${f.val}" placeholder="Valor..." style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; flex-grow: 1;">
              <button class="btn btn-outline" style="border-color: #ef4444; color: #ef4444; padding: 0.5rem 1rem;" onclick="window.removeFilter(${i})">X</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    if (!isReRender) {
      // Find defaults for initial HTML state
      let defaultXCol = columns.find(c => c.toLowerCase().includes('idade') || c.toLowerCase().includes('age')) || columns[2] || columns[0];
      let defaultYCol = columns.find(c => c.toLowerCase().includes('valor') || c.toLowerCase().includes('value')) || columns[3] || columns[1];

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h2 style="color: var(--primary-color);">Data Grid & Análise Moneyball</h2>
          <button class="btn btn-outline" onclick="window.backToDash()">Voltar</button>
        </div>
        
        <div id="filters-root">
          ${filtersHtml}
        </div>
        
        <div class="card" style="margin-bottom: 1.5rem; background-color: var(--surface-color);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
            <h3 style="color: var(--text-primary); margin: 0;">Scatter Plot</h3>
            <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
              <div>
                Eixo X: 
                <select id="scatter-axis-x" onchange="window.updateScatterAxes()" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.25rem; border-radius: 4px;">
                  ${columns.map(col => `<option value="${col}" ${col === defaultXCol ? 'selected' : ''}>${col}</option>`).join('')}
                </select>
              </div>
              <div>
                Eixo Y: 
                <select id="scatter-axis-y" onchange="window.updateScatterAxes()" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.25rem; border-radius: 4px;">
                  ${columns.map(col => `<option value="${col}" ${col === defaultYCol ? 'selected' : ''}>${col}</option>`).join('')}
                </select>
              </div>
              <span id="scatter-label" style="margin-left: 1rem;">Mostrando: Global (Amostra 2000)</span>
              <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="window.toggleScatterMode()">Alternar para Página Atual</button>
            </div>
          </div>
          <div id="chart-scatter" style="width: 100%; height: 400px;"></div>
        </div>
        
        <div id="table-root">
          ${tableHtml}
        </div>
      `;
    } else {
      const tableRoot = document.getElementById('table-root');
      if (tableRoot) tableRoot.innerHTML = tableHtml;
      
      const filtersRoot = document.getElementById('filters-root');
      if (filtersRoot) filtersRoot.innerHTML = filtersHtml;
    }
    
    // Global Event Handlers
    window.backToDash = () => navigateTo('dashboard');
    window.changePage = (newPage: number, id: number) => {
      currentPage = newPage;
      renderGridView(container, id, true);
    };
    window.handleSort = (col: string, id: number) => {
      if (currentSortBy === col) {
        currentSortOrder = currentSortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        currentSortBy = col;
        currentSortOrder = 'DESC'; // Default to DESC for new sort
      }
      renderGridView(container, id, true);
    };
    
    window.changePage = (newPage: number, id: number) => {
      if (newPage < 1 || newPage > pagination.totalPages) return;
      currentPage = newPage;
      renderGridView(container, id, true);
    };

    window.addFilter = () => {
      currentFilters.push({ col: columns[0] || '', op: '=', val: '' });
      renderGridView(container, importId, true);
    };

    window.removeFilter = (index: number) => {
      currentFilters.splice(index, 1);
      renderGridView(container, importId, true);
    };

    window.applyFilters = (id: number) => {
      // Sync current UI values into currentFilters state
      const filterEls = document.querySelectorAll('#filters-list > div');
      const newFilters: any[] = [];
      filterEls.forEach(el => {
        const col = (el.querySelector('.filter-col') as HTMLSelectElement)?.value;
        const op = (el.querySelector('.filter-op') as HTMLSelectElement)?.value;
        const val = (el.querySelector('.filter-val') as HTMLInputElement)?.value;
        if (col && op && val) {
          newFilters.push({ col, op, val });
        }
      });
      currentFilters = newFilters;
      currentPage = 1; // Reset to page 1 on new filters
      renderGridView(container, id, true);
    };

    window.toggleScatterMode = () => {
      scatterMode = scatterMode === 'global' ? 'page' : 'global';
      const label = document.getElementById('scatter-label');
      const btn = document.querySelector('button[onclick="window.toggleScatterMode()"]');
      if (label && btn) {
        label.textContent = scatterMode === 'global' ? 'Mostrando: Global (Amostra 2000)' : 'Mostrando: Somente Página Atual';
        btn.textContent = scatterMode === 'global' ? 'Alternar para Página Atual' : 'Alternar para Global';
      }
      if (typeof updateChart === 'function') updateChart();
    };

    // Initialize ECharts Scatter Plot and setup toggle logic
    let defaultXCol = columns.find(c => c.toLowerCase().includes('idade') || c.toLowerCase().includes('age')) || columns[2] || columns[0];
    let defaultYCol = columns.find(c => c.toLowerCase().includes('valor') || c.toLowerCase().includes('value')) || columns[3] || columns[1];

    const updateChart = () => {
      if (!window.myChart) return;
      const dataToUse = scatterMode === 'global' ? window.globalScatterData : window.lastPaginatedData;
      
      const selectX = document.getElementById('scatter-axis-x') as HTMLSelectElement;
      const selectY = document.getElementById('scatter-axis-y') as HTMLSelectElement;
      const xCol = selectX ? selectX.value : defaultXCol;
      const yCol = selectY ? selectY.value : defaultYCol;
      
      const chartData = dataToUse.map((p: any) => {
        const xVal = parseFloat(String(p[xCol]).replace(/[^0-9.-]/g, ''));
        const yVal = parseFloat(String(p[yCol]).replace(/[^0-9.-]/g, ''));
        return [
          isNaN(xVal) ? 0 : xVal,
          isNaN(yVal) ? 0 : yVal,
          p.Nome || p.Name || 'Jogador'
        ];
      });

      window.myChart.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          formatter: function (params: any) {
            return `${params.value[2]}<br/>${xCol}: ${params.value[0]}<br/>${yCol}: ${params.value[1]}`;
          }
        },
        xAxis: { 
          type: 'value', 
          name: xCol,
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        yAxis: { 
          type: 'value', 
          name: yCol,
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        series: [{
          symbolSize: 10,
          data: chartData,
          type: 'scatter',
          itemStyle: {
            color: '#a855f7',
            opacity: 0.8,
            shadowBlur: 10,
            shadowColor: 'rgba(168, 85, 247, 0.5)'
          }
        }]
      }, true);
    };

    window.updateScatterAxes = () => {
      if (typeof updateChart === 'function') updateChart();
    };

    if (!isReRender) {
      if (scatterData) window.globalScatterData = scatterData;
      
      const chartDom = document.getElementById('chart-scatter');
      if (chartDom) {
        window.myChart = echarts.init(chartDom, 'dark', { renderer: 'svg' });
        window.addEventListener('resize', () => window.myChart?.resize());
      }
    }

    // Always update paginated data cache and update chart to reflect new page if in 'page' mode
    window.lastPaginatedData = players;
    updateChart();
    
    // Add Drawer DOM if it doesn't exist
    if (!document.getElementById('drawer-container')) {
      const drawerContainer = document.createElement('div');
      drawerContainer.id = 'drawer-container';
      document.body.appendChild(drawerContainer);
    }

    window.closePlayerDrawer = () => {
      const overlay = document.getElementById('drawer-overlay');
      const drawer = document.getElementById('player-drawer');
      if (overlay) {
        overlay.style.animation = 'fadeOut 0.2s ease-out forwards';
        setTimeout(() => overlay.remove(), 200);
      }
      if (drawer) {
        drawer.classList.add('closing');
        setTimeout(() => drawer.remove(), 300);
      }
      if (window.radarMyChart) {
        window.radarMyChart.dispose();
        window.radarMyChart = null;
      }
    };

    window.updateRadarAttributes = () => {
      const drawerContainer = document.getElementById('drawer-container');
      if (!drawerContainer) return;
      
      const checkboxes = drawerContainer.querySelectorAll('.radar-metric-cb:checked');
      const selectedAttributes = Array.from(checkboxes).map((cb: any) => cb.value);
      
      const player = window.lastPaginatedData[window.currentRadarPlayerIndex];
      const name = player.Nome || player.Name || 'Jogador';
      
      const radarDom = document.getElementById('chart-radar');
      if (!radarDom) return;
      
      if (selectedAttributes.length < 3) {
        radarDom.innerHTML = `<p style="color: var(--text-secondary); text-align: center; margin-top: 5rem;">Selecione pelo menos 3 métricas para desenhar o Radar.</p>`;
        if (window.radarMyChart) {
          window.radarMyChart.dispose();
          window.radarMyChart = null;
        }
        return;
      }

      if (!window.radarMyChart) {
        window.radarMyChart = echarts.init(radarDom, 'dark', { renderer: 'svg' });
      }

      // Calculate Max values from global sample to scale the radar properly
      const indicator = selectedAttributes.map(attr => {
        const vals = window.globalScatterData.map(p => parseFloat(String(p[attr]).replace(/[^0-9.-]/g, '')) || 0);
        let maxVal = Math.max(...vals);
        if (maxVal <= 0) maxVal = 10; // Fallback
        return { name: attr, max: maxVal * 1.05 }; // 5% buffer
      });

      const dataValues = selectedAttributes.map(attr => parseFloat(String(player[attr]).replace(/[^0-9.-]/g, '')) || 0);

      window.radarMyChart.setOption({
        backgroundColor: 'transparent',
        tooltip: {},
        radar: {
          indicator: indicator,
          splitArea: {
            areaStyle: {
              color: ['rgba(168, 85, 247, 0.1)', 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.4)', 'rgba(168, 85, 247, 0.6)'].reverse()
            }
          },
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } }
        },
        series: [{
          name: name,
          type: 'radar',
          data: [
            {
              value: dataValues,
              name: 'Estatísticas',
              areaStyle: { color: 'rgba(168, 85, 247, 0.5)' },
              lineStyle: { color: '#a855f7', width: 2 },
              itemStyle: { color: '#a855f7' }
            }
          ]
        }]
      }, true);
    };

    window.openPlayerDrawer = (index: number) => {
      window.currentRadarPlayerIndex = index;
      const player = window.lastPaginatedData[index];
      const name = player.Nome || player.Name || 'Jogador';
      
      // Find all numeric columns
      const excludePatterns = ['id', 'age', 'idade', 'value', 'valor', 'wage', 'salário'];
      
      const numericAttributes = Object.keys(player).filter(key => {
        const lowerKey = key.toLowerCase();
        if (excludePatterns.some(p => lowerKey.includes(p))) return false;
        
        const raw = String(player[key]).replace(/[^0-9.-]/g, '');
        if (!raw) return false;
        const val = parseFloat(raw);
        return !isNaN(val);
      });
      
      // Default to first 6 metrics
      const defaultSelected = numericAttributes.slice(0, 6);
      
      const drawerContainer = document.getElementById('drawer-container');
      if (!drawerContainer) return;

      drawerContainer.innerHTML = `
        <div class="drawer-overlay" id="drawer-overlay" onclick="window.closePlayerDrawer()"></div>
        <div class="drawer" id="player-drawer">
          <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="color: var(--primary-color); margin: 0;">${name}</h2>
            <button onclick="window.closePlayerDrawer()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.5rem;">&times;</button>
          </div>
          
          <div style="padding: 1.5rem; flex-grow: 1;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
              <div class="card" style="padding: 1rem;"><small style="color:var(--text-secondary);">Idade</small><br/><strong>${player.Idade || player.Age || '-'}</strong></div>
              <div class="card" style="padding: 1rem;"><small style="color:var(--text-secondary);">Valor</small><br/><strong>${player.Valor || player.Value || '-'}</strong></div>
            </div>
            
            <div class="card" style="margin-bottom: 1rem;">
              <h3 style="margin-bottom: 1rem;">Perfil (Radar)</h3>
              <div id="chart-radar" style="width: 100%; height: 350px;"></div>
            </div>
            
            <div style="margin-top: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">Escolha as Métricas para o Radar:</p>
                <button onclick="window.saveRadarGabarito()" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;"><i class="fa-solid fa-floppy-disk"></i> Salvar Gabarito</button>
              </div>
              
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <input type="text" id="radar-search" onkeyup="window.filterRadarMetrics(this.value)" placeholder="Buscar métrica..." style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; flex-grow: 1; font-size: 0.8rem;">
                <select id="radar-gabaritos" onchange="window.loadRadarGabarito(this.value)" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; font-size: 0.8rem; width: 120px;">
                  <option value="">Carregar...</option>
                </select>
              </div>
              
              <div id="radar-metrics-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 200px; overflow-y: auto; padding-right: 0.5rem;">
                ${numericAttributes.map(attr => `
                  <label class="radar-metric-label" style="display: flex; align-items: center; gap: 0.25rem; background: rgba(255,255,255,0.05); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                    <input type="checkbox" class="radar-metric-cb" value="${attr}" ${defaultSelected.includes(attr) ? 'checked' : ''} onchange="window.updateRadarAttributes()">
                    <span class="metric-name">${attr}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      // Load Gabaritos from LocalStorage
      window.refreshGabaritosDropdown();

      // Initialize Radar via the update function
      setTimeout(() => {
        window.updateRadarAttributes();
      }, 300); // Wait for drawer slide-in animation
    };

    window.openViewConfigModal = () => {
      // Create modal container
      const modal = document.createElement('div');
      modal.id = 'view-config-modal';
      modal.className = 'modal-overlay';
      
      const numericColumns = globalColumns.filter(c => {
        const val = parseFloat(String(players[0]?.[c]).replace(/[^0-9.-]/g, ''));
        return !isNaN(val);
      });
      
      const operators = ['+', '-', '*', '/', '(', ')'];
      
      const renderColumnsList = () => {
        const q = ((window as any)._configSearchQuery || '').toLowerCase();
        return orderedColumns
          .filter(attr => {
            if (!q) return true;
            const alias = columnAliases[attr] || '';
            return attr.toLowerCase().includes(q) || alias.toLowerCase().includes(q);
          })
          .map((attr, index) => `
          <div draggable="true"
               ondragstart="window.handleColDragStart(event, '${attr}')"
               ondragover="window.handleColDragOver(event)"
               ondrop="window.handleColDrop(event, '${attr}')"
               style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; border: 1px solid ${!hiddenColumns.includes(attr) ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.1)'}; width: 100%; cursor: grab;">
            <div style="display: flex; flex-direction: column; gap: 4px; padding: 0 4px;">
              <button onclick="window.moveColumnUp('${attr}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size: 0.8rem; line-height: 1;" ${index === 0 ? 'disabled style="opacity:0.3"' : ''} title="Mover para cima"><i class="fa-solid fa-chevron-up"></i></button>
              <button onclick="window.moveColumnDown('${attr}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size: 0.8rem; line-height: 1;" ${index === orderedColumns.length - 1 ? 'disabled style="opacity:0.3"' : ''} title="Mover para baixo"><i class="fa-solid fa-chevron-down"></i></button>
            </div>
            
            <input type="checkbox" value="${attr}" ${!hiddenColumns.includes(attr) ? 'checked' : ''} onchange="window.toggleColumnVisibility('${attr}')" title="Mostrar/Esconder">
            
            <span style="min-width: 150px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${attr}">
              ${attr}
            </span>
            
            <input type="text" placeholder="Apelido da coluna..." value="${columnAliases[attr] || ''}" onchange="window.setColumnAlias('${attr}', this.value)" style="flex-grow: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">
            
            <select onchange="window.setColumnFormat('${attr}', this.value)" style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.25rem; border-radius: 4px; font-size: 0.8rem; width: 60px;" title="Formatação Numérica">
              <option value="default" ${columnFormats[attr] === 'default' || !columnFormats[attr] ? 'selected' : ''}>Num</option>
              <option value="percent" ${columnFormats[attr] === 'percent' ? 'selected' : ''}>%</option>
              <option value="decimal" ${columnFormats[attr] === 'decimal' ? 'selected' : ''}>0.00</option>
            </select>
            
            ${calculatedFields.includes(attr) ? `<button onclick="window.deleteCustomColumn(${importId}, '${attr}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.25rem;" title="Deletar Coluna (Atenção!)"><i class="fa-solid fa-trash"></i></button>` : `<div style="width: 24px;"></div>`}
          </div>
        `).join('');
      };
      
      modal.innerHTML = `
        <div class="modal" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
          <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="color: var(--primary-color); margin: 0;">Configurar Visão & Campos Calculados</h2>
            <button onclick="window.closeViewConfigModal()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.5rem;">&times;</button>
          </div>
          
          <div style="padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 2rem;">
            
            <!-- Saved Views Section -->
            <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color);">
              <h3 style="margin-bottom: 0.5rem; font-size: 1rem;">Visualizações Salvas</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">Salve a seleção de colunas atual para recuperar rapidamente depois.</p>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <select id="saved-views-select" style="flex-grow: 1; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem; border-radius: 4px;">
                  <option value="">Selecione uma visualização...</option>
                </select>
                <button class="btn btn-outline" onclick="window.loadSavedView()">Carregar</button>
                <button class="btn btn-outline" onclick="window.saveCurrentView()">Salvar Atual</button>
                <button class="btn btn-outline" style="color: #ef4444; border-color: #ef4444;" onclick="window.deleteSavedView()">Excluir</button>
              </div>
            </div>

            <!-- Visible Columns Section -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem;">
                <h3 style="margin: 0;">Gerenciar Colunas da Tabela</h3>
                <div style="display: flex; gap: 0.5rem;">
                  <input type="text" placeholder="Buscar campo..." oninput="window.filterConfigColumns(this.value)" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.4rem 0.75rem; border-radius: 4px; font-size: 0.8rem;">
                  <button class="btn btn-outline" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;" onclick="window.toggleAllColumns(true)">Marcar Todos</button>
                  <button class="btn btn-outline" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;" onclick="window.toggleAllColumns(false)">Desmarcar Todos</button>
                </div>
              </div>
              <div id="view-config-columns-list" style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto; padding-right: 0.5rem;">
                ${renderColumnsList()}
              </div>
            </div>

            <!-- Calculated Fields Section -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 2rem;">
              <h3 style="margin-bottom: 1rem;">Criar Campo Calculado</h3>
              <div style="display: flex; gap: 1rem; align-items: stretch;">
                
                <!-- Draggables -->
                <div style="width: 250px; display: flex; flex-direction: column; gap: 1rem; border-right: 1px solid var(--border-color); padding-right: 1rem;">
                  <div>
                    <h4 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Colunas Numéricas (Arrastar)</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 200px; overflow-y: auto;">
                      ${numericColumns.map(c => `
                        <div draggable="true" ondragstart="window.handleDragStart(event, 'column', '${c}')" 
                             style="background: rgba(168,85,247,0.2); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; cursor: grab; user-select: none; border: 1px solid rgba(168,85,247,0.5);">
                          ${c}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                  <div>
                    <h4 style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Operadores (Arrastar)</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                      ${operators.map(op => `
                        <div draggable="true" ondragstart="window.handleDragStart(event, 'operator', '${op}')" 
                             style="background: rgba(255,255,255,0.1); padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 1rem; cursor: grab; user-select: none; border: 1px solid rgba(255,255,255,0.2); font-weight: bold;">
                          ${op}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
                
                <!-- Dropzone and Form -->
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 1rem;">
                  <div>
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Nome do Novo Campo</label>
                    <input type="text" id="calc-field-name" placeholder="Ex: % Acerto Passes" style="width: 100%; background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px;">
                  </div>
                  
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                      <label style="color: var(--text-secondary); font-size: 0.9rem;">Fórmula (Solte os itens abaixo)</label>
                      <button onclick="window.clearFormula()" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;">Limpar</button>
                    </div>
                    <div id="formula-dropzone" 
                         ondrop="window.handleDropFormula(event)" 
                         ondragover="window.handleDragOver(event)"
                         style="width: 100%; min-height: 100px; background: rgba(0,0,0,0.2); border: 2px dashed var(--border-color); border-radius: 4px; padding: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-content: flex-start;">
                    </div>
                    <small style="color: #64748b; margin-top: 0.5rem; display: block;">Arraste as colunas e os operadores para montar sua fórmula matemática.</small>
                  </div>
                  
                  <button class="btn btn-primary" style="align-self: flex-end;" onclick="window.saveCalculatedField(${importId})">Criar Campo Virtual</button>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Store render logic globally so handlers can refresh the list
      (window as any)._renderViewConfigList = renderColumnsList;
      
      // Populate saved views dropdown
      setTimeout(() => window.refreshSavedViewsList(), 50);
    };

    window.closeViewConfigModal = () => {
      const modal = document.getElementById('view-config-modal');
      if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease-out forwards';
        setTimeout(() => modal.remove(), 200);
      }
    };

    window.toggleColumnVisibility = (col: string) => {
      if (hiddenColumns.includes(col)) {
        hiddenColumns = hiddenColumns.filter(c => c !== col);
      } else {
        hiddenColumns.push(col);
      }
      renderGridView(container, importId, true);
      
      const listContainer = document.getElementById('view-config-columns-list');
      if (listContainer && (window as any)._renderViewConfigList) {
        listContainer.innerHTML = (window as any)._renderViewConfigList();
      }
    };

    window.moveColumnUp = (col: string) => {
      const idx = orderedColumns.indexOf(col);
      if (idx > 0) {
        [orderedColumns[idx - 1], orderedColumns[idx]] = [orderedColumns[idx], orderedColumns[idx - 1]];
        renderGridView(container, importId, true);
        const listContainer = document.getElementById('view-config-columns-list');
        if (listContainer && (window as any)._renderViewConfigList) {
          listContainer.innerHTML = (window as any)._renderViewConfigList();
        }
      }
    };

    window.moveColumnDown = (col: string) => {
      const idx = orderedColumns.indexOf(col);
      if (idx > -1 && idx < orderedColumns.length - 1) {
        [orderedColumns[idx], orderedColumns[idx + 1]] = [orderedColumns[idx + 1], orderedColumns[idx]];
        renderGridView(container, importId, true);
        const listContainer = document.getElementById('view-config-columns-list');
        if (listContainer && (window as any)._renderViewConfigList) {
          listContainer.innerHTML = (window as any)._renderViewConfigList();
        }
      }
    };

    window.togglePlayerSelection = (e: Event, index: number) => {
      e.stopPropagation(); // prevent opening the single player drawer
      const player = window.lastPaginatedData[index];
      const existingIdx = selectedPlayersData.findIndex(p => p.id === player.id);
      
      if (existingIdx >= 0) {
        selectedPlayersData.splice(existingIdx, 1);
      } else {
        if (selectedPlayersData.length >= 5) {
          showToast('Máximo de 5 jogadores para comparação atingido.', 'error');
          return;
        }
        selectedPlayersData.push(player);
      }
      renderGridView(container, importId, true);
    };

    window.openComparisonDrawer = () => {
      if (selectedPlayersData.length < 2) return;
      
      // Find all numeric columns common to these players
      const excludePatterns = ['id', 'age', 'idade', 'value', 'valor', 'wage', 'salário'];
      
      const numericAttributes = globalColumns.filter(key => {
        const lowerKey = key.toLowerCase();
        if (excludePatterns.some(p => lowerKey.includes(p))) return false;
        
        // Ensure all selected players have a valid number for this attribute
        return selectedPlayersData.every(p => {
          const raw = String(p[key]).replace(/[^0-9.-]/g, '');
          if (!raw) return false;
          return !isNaN(parseFloat(raw));
        });
      });
      
      const defaultSelected = numericAttributes.slice(0, 6);
      
      let drawerContainer = document.getElementById('drawer-container');
      if (!drawerContainer) {
        drawerContainer = document.createElement('div');
        drawerContainer.id = 'drawer-container';
        document.body.appendChild(drawerContainer);
      }

      const names = selectedPlayersData.map(p => p.Nome || p.Name || 'Jogador').join(' vs ');

      drawerContainer.innerHTML = `
        <div class="drawer-overlay" id="drawer-overlay" onclick="window.closePlayerDrawer()"></div>
        <div class="drawer" id="player-drawer">
          <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="color: var(--primary-color); margin: 0;">Comparação de Jogadores</h2>
            <button onclick="window.closePlayerDrawer()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.5rem;">&times;</button>
          </div>
          
          <div style="padding: 1.5rem; flex-grow: 1;">
            <p style="color: var(--text-secondary); margin-bottom: 1rem;">${names}</p>
            
            <div class="card" style="margin-bottom: 1rem;">
              <h3 style="margin-bottom: 1rem;">Radar Comparativo</h3>
              <div id="chart-radar" style="width: 100%; height: 350px;"></div>
            </div>
            
            <div style="margin-top: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">Escolha as Métricas para o Radar:</p>
                <button onclick="window.saveRadarGabarito()" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.7rem;"><i class="fa-solid fa-floppy-disk"></i> Salvar Gabarito</button>
              </div>
              
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                <input type="text" id="radar-search" onkeyup="window.filterRadarMetrics(this.value)" placeholder="Buscar métrica..." style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; flex-grow: 1; font-size: 0.8rem;">
                <select id="radar-gabaritos" onchange="window.loadRadarGabarito(this.value)" style="background: var(--bg-color); color: var(--text-primary); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; font-size: 0.8rem; width: 120px;">
                  <option value="">Carregar...</option>
                </select>
              </div>
              
              <div id="radar-metrics-list" style="display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 200px; overflow-y: auto; padding-right: 0.5rem;">
                ${numericAttributes.map(attr => `
                  <label class="radar-metric-label" style="display: flex; align-items: center; gap: 0.25rem; background: rgba(255,255,255,0.05); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">
                    <input type="checkbox" class="radar-metric-cb" value="${attr}" ${defaultSelected.includes(attr) ? 'checked' : ''} onchange="window.updateComparisonRadarAttributes()">
                    <span class="metric-name">${attr}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      window.refreshGabaritosDropdown();

      setTimeout(() => {
        window.updateComparisonRadarAttributes();
      }, 300);
    };

    window.updateComparisonRadarAttributes = () => {
      const drawerContainer = document.getElementById('drawer-container');
      if (!drawerContainer) return;
      
      const checkboxes = drawerContainer.querySelectorAll('.radar-metric-cb:checked');
      const selectedAttributes = Array.from(checkboxes).map((cb: any) => cb.value);
      
      const radarDom = document.getElementById('chart-radar');
      if (!radarDom) return;
      
      if (selectedAttributes.length < 3) {
        radarDom.innerHTML = `<p style="color: var(--text-secondary); text-align: center; margin-top: 5rem;">Selecione pelo menos 3 métricas para desenhar o Radar.</p>`;
        if (window.radarMyChart) {
          window.radarMyChart.dispose();
          window.radarMyChart = null;
        }
        return;
      }

      if (!window.radarMyChart) {
        window.radarMyChart = echarts.init(radarDom, 'dark', { renderer: 'svg' });
      }

      // Calculate Max values from global sample to scale the radar properly
      const indicator = selectedAttributes.map(attr => {
        const vals = window.globalScatterData.map(p => parseFloat(String(p[attr]).replace(/[^0-9.-]/g, '')) || 0);
        let maxVal = Math.max(...vals);
        if (maxVal <= 0) maxVal = 10;
        return { name: attr, max: maxVal * 1.05 };
      });

      const seriesData = selectedPlayersData.map((player, idx) => {
        const name = player.Nome || player.Name || `Jogador ${idx+1}`;
        const dataValues = selectedAttributes.map(attr => parseFloat(String(player[attr]).replace(/[^0-9.-]/g, '')) || 0);
        
        // distinct colors for comparison
        const colors = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        const color = colors[idx % colors.length];

        return {
          value: dataValues,
          name: name,
          areaStyle: { color: color, opacity: 0.2 },
          lineStyle: { color: color, width: 2 },
          itemStyle: { color: color }
        };
      });

      window.radarMyChart.setOption({
        backgroundColor: 'transparent',
        tooltip: {},
        legend: {
          data: selectedPlayersData.map((p, idx) => p.Nome || p.Name || `Jogador ${idx+1}`),
          textStyle: { color: '#fff' },
          bottom: 0
        },
        radar: {
          indicator: indicator,
          splitArea: {
            areaStyle: {
              color: ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.1)']
            }
          },
          axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } }
        },
        series: [{
          type: 'radar',
          data: seriesData
        }]
      }, true);
    };

    window.setColumnAlias = (col: string, alias: string) => {
      if (alias.trim() === '') {
        delete columnAliases[col];
      } else {
        columnAliases[col] = alias;
      }
      renderGridView(container, importId, true);
    };

    window.setColumnFormat = (col: string, format: string) => {
      if (format === 'default' || !format) {
        delete columnFormats[col];
      } else {
        columnFormats[col] = format as 'percent' | 'decimal';
      }
      renderGridView(container, importId, true);
    };

    window.deleteCustomColumn = async (id: number, col: string) => {
      showConfirmModal('Excluir Coluna', `Tem certeza que deseja deletar a coluna calculada '${col}'? Esta ação não pode ser desfeita.`).then(async (confirmed) => {
        if (!confirmed) return;
        try {
          const { deleteCalculatedField } = await import('../api/client');
          await deleteCalculatedField(id, col);
          showToast(`Coluna "${col}" deletada com sucesso!`, 'success');
          
          // Remove from local state
          globalColumns = globalColumns.filter(c => c !== col);
          orderedColumns = orderedColumns.filter(c => c !== col);
          hiddenColumns = hiddenColumns.filter(c => c !== col);
          calculatedFields = calculatedFields.filter(c => c !== col);
          delete columnAliases[col];
          
          renderGridView(container, id, true);
          const listContainer = document.getElementById('view-config-columns-list');
          if (listContainer && (window as any)._renderViewConfigList) {
            listContainer.innerHTML = (window as any)._renderViewConfigList();
          }
        } catch (err: any) {
          showToast(err.message, 'error');
        }
      });
    };

    window.handleColDragStart = (e: DragEvent, col: string) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'col-reorder', value: col }));
        e.dataTransfer.effectAllowed = 'move';
      }
    };

    window.handleColDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    };

    window.handleColDrop = (e: DragEvent, targetCol: string) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'col-reorder' && data.value && data.value !== targetCol) {
          const sourceCol = data.value;
          const fromIdx = orderedColumns.indexOf(sourceCol);
          const toIdx = orderedColumns.indexOf(targetCol);
          
          if (fromIdx > -1 && toIdx > -1) {
            orderedColumns.splice(fromIdx, 1);
            orderedColumns.splice(toIdx, 0, sourceCol);
            
            renderGridView(container, importId, true);
            const listContainer = document.getElementById('view-config-columns-list');
            if (listContainer && (window as any)._renderViewConfigList) {
              listContainer.innerHTML = (window as any)._renderViewConfigList();
            }
          }
        }
      } catch (err) {
        // Not a column reorder drop
      }
    };

    // Drag and Drop Logic
    window.handleDragStart = (e: DragEvent, type: string, value: string) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type, value }));
        e.dataTransfer.effectAllowed = 'copy';
      }
    };

    window.handleDragOver = (e: DragEvent) => {
      e.preventDefault(); // Necessary to allow dropping
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    window.handleDropFormula = (e: DragEvent) => {
      e.preventDefault();
      const dropzone = document.getElementById('formula-dropzone');
      if (!dropzone || !e.dataTransfer) return;
      
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      
      try {
        const data = JSON.parse(dataStr);
        const el = document.createElement('div');
        el.style.padding = '0.25rem 0.5rem';
        el.style.borderRadius = '4px';
        el.style.border = '1px solid ' + (data.type === 'column' ? '#a855f7' : 'rgba(255,255,255,0.3)');
        el.style.background = data.type === 'column' ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.2)';
        el.innerText = data.value;
        // Cast columns to REAL to avoid integer division truncation in SQLite
        el.dataset.sql = data.type === 'column' ? `CAST("${data.value}" AS REAL)` : data.value;
        
        dropzone.appendChild(el);
      } catch (err) {
        console.error('Invalid drop data');
      }
    };

    window.clearFormula = () => {
      const dropzone = document.getElementById('formula-dropzone');
      if (dropzone) dropzone.innerHTML = '';
    };

    window.saveCalculatedField = async (id: number) => {
      const nameInput = document.getElementById('calc-field-name') as HTMLInputElement;
      const dropzone = document.getElementById('formula-dropzone');
      
      const fieldName = nameInput?.value.trim();
      if (!fieldName) return showToast('Digite um nome para o campo', 'error');
      
      if (!dropzone || dropzone.children.length === 0) {
        return showToast('A fórmula não pode estar vazia', 'error');
      }
      
      const formulaSql = Array.from(dropzone.children)
                              .map(child => (child as HTMLElement).dataset.sql)
                              .join(' ');
                              
      try {
        const { createCalculatedField } = await import('../api/client');
        await createCalculatedField(id, fieldName, formulaSql);
        showToast(`Campo "${fieldName}" criado com sucesso!`, 'success');
        window.closeViewConfigModal();
        // Reload Grid to see new column
        renderGridView(container, id, true);
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    };

    window.filterRadarMetrics = (query: string) => {
      const q = query.toLowerCase();
      const labels = document.querySelectorAll('.radar-metric-label');
      labels.forEach((label: any) => {
        const span = label.querySelector('.metric-name') as HTMLSpanElement;
        if (span.innerText.toLowerCase().includes(q)) {
          label.style.display = 'flex';
        } else {
          label.style.display = 'none';
        }
      });
    };

    window.refreshGabaritosDropdown = () => {
      const select = document.getElementById('radar-gabaritos') as HTMLSelectElement;
      if (!select) return;
      
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem('radar_gabaritos') || '{}');
      } catch(e) {}
      
      select.innerHTML = '<option value="">Carregar...</option>';
      for (const name in saved) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
      }
    };

    window.saveRadarGabarito = () => {
      showInputModal('Salvar Gabarito', 'Digite o nome para este gabarito:', 'Ex: Laterais Ofensivos').then(name => {
        if (!name) return;
        
        const drawerContainer = document.getElementById('player-drawer');
        if (!drawerContainer) return;
        
        const checkboxes = drawerContainer.querySelectorAll('.radar-metric-cb:checked');
        const selectedAttributes = Array.from(checkboxes).map((cb: any) => cb.value);
        
        if (selectedAttributes.length === 0) return showToast('Selecione pelo menos uma métrica.', 'error');
        
        let saved: any = {};
        try {
          saved = JSON.parse(localStorage.getItem('radar_gabaritos') || '{}');
        } catch(e) {}
        
        saved[name] = selectedAttributes;
        localStorage.setItem('radar_gabaritos', JSON.stringify(saved));
        
        window.refreshGabaritosDropdown();
        const select = document.getElementById('radar-gabaritos') as HTMLSelectElement;
        if (select) select.value = name;
        
        showToast('Gabarito salvo!', 'success');
      });
    };

    window.loadRadarGabarito = (name: string) => {
      if (!name) return;
      let saved: any = {};
      try {
        saved = JSON.parse(localStorage.getItem('radar_gabaritos') || '{}');
      } catch(e) {}
      
      const attrs = saved[name];
      if (!attrs || !Array.isArray(attrs)) return;
      
      const drawerContainer = document.getElementById('drawer-container');
      if (!drawerContainer) return;
      
      const checkboxes = drawerContainer.querySelectorAll('.radar-metric-cb');
      checkboxes.forEach((cb: any) => {
        cb.checked = attrs.includes(cb.value);
      });
      
      const title = drawerContainer.querySelector('h2')?.innerText || '';
      if (title.includes('Comparação')) {
        window.updateComparisonRadarAttributes();
      } else {
        window.updateRadarAttributes();
      }
    };

    window.toggleAllColumns = (show: boolean) => {
      if (show) {
        hiddenColumns = [];
      } else {
        hiddenColumns = [...globalColumns];
      }
      renderGridView(container, importId, true);
      const listContainer = document.getElementById('view-config-columns-list');
      if (listContainer && (window as any)._renderViewConfigList) {
        listContainer.innerHTML = (window as any)._renderViewConfigList();
      }
    };

    window.filterConfigColumns = (q: string) => {
      (window as any)._configSearchQuery = q;
      const listContainer = document.getElementById('view-config-columns-list');
      if (listContainer && (window as any)._renderViewConfigList) {
        listContainer.innerHTML = (window as any)._renderViewConfigList();
      }
    };

    window.refreshSavedViewsList = () => {
      const select = document.getElementById('saved-views-select') as HTMLSelectElement;
      if (!select) return;
      
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(`moneyball_views_${importId}`) || '{}');
      } catch(e) {}
      
      select.innerHTML = '<option value="">Selecione uma visualização...</option>';
      for (const name in saved) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
      }
    };

    window.saveCurrentView = () => {
      import('../utils/modal').then(({ showInputModal }) => {
        showInputModal('Salvar Visualização', 'Digite o nome para esta visualização de colunas:', 'Ex: Visão Atacantes').then(name => {
          if (!name) return;
          let saved: any = {};
          try {
            saved = JSON.parse(localStorage.getItem(`moneyball_views_${importId}`) || '{}');
          } catch(e) {}
          
          saved[name] = {
            orderedColumns,
            hiddenColumns,
            columnAliases,
            columnFormats
          };
          localStorage.setItem(`moneyball_views_${importId}`, JSON.stringify(saved));
          window.refreshSavedViewsList();
          
          const select = document.getElementById('saved-views-select') as HTMLSelectElement;
          if (select) select.value = name;
          import('../utils/toast').then(({ showToast }) => showToast('Visualização salva!', 'success'));
        });
      });
    };

    window.loadSavedView = () => {
      const select = document.getElementById('saved-views-select') as HTMLSelectElement;
      const name = select?.value;
      if (!name) return;
      
      let saved: any = {};
      try {
        saved = JSON.parse(localStorage.getItem(`moneyball_views_${importId}`) || '{}');
      } catch(e) {}
      
      const view = saved[name];
      if (!view) return;
      
      if (view.orderedColumns) orderedColumns = view.orderedColumns;
      if (view.hiddenColumns) hiddenColumns = view.hiddenColumns;
      if (view.columnAliases) columnAliases = view.columnAliases;
      if (view.columnFormats) columnFormats = view.columnFormats;
      
      // Save globally
      localStorage.setItem(`grid_config_${importId}`, JSON.stringify({
        orderedColumns, hiddenColumns, columnAliases, columnFormats
      }));
      
      // Re-render
      renderGridView(container, importId, true);
      
      const listContainer = document.getElementById('view-config-columns-list');
      if (listContainer && (window as any)._renderViewConfigList) {
        listContainer.innerHTML = (window as any)._renderViewConfigList();
      }
      import('../utils/toast').then(({ showToast }) => showToast('Visualização carregada!', 'success'));
    };

    window.deleteSavedView = () => {
      const select = document.getElementById('saved-views-select') as HTMLSelectElement;
      const name = select?.value;
      if (!name) return;
      
      let saved: any = {};
      try {
        saved = JSON.parse(localStorage.getItem(`moneyball_views_${importId}`) || '{}');
      } catch(e) {}
      
      if (saved[name]) {
        delete saved[name];
        localStorage.setItem(`moneyball_views_${importId}`, JSON.stringify(saved));
        window.refreshSavedViewsList();
        select.value = '';
        import('../utils/toast').then(({ showToast }) => showToast('Visualização excluída.', 'success'));
      }
    };

  } catch (err: any) {
    if (!isReRender) {
      container.innerHTML = `<div class="card" style="color: red;">Erro ao carregar jogadores: ${err.message}</div>`;
    } else {
      const tableRoot = document.getElementById('table-root');
      if (tableRoot) tableRoot.innerHTML = `<div class="card" style="color: red;">Erro ao paginar: ${err.message}</div>`;
    }
  }
}
