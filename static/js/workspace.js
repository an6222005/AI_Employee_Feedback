/* Presentation and navigation for the copied HR workspace. Data stays in admin.js. */
let activeAnalysisView = 'overview';

function setWorkspaceLoadState(state, message = '') {
    const status = document.getElementById('workspace-load-status');
    const refresh = document.getElementById('refresh-workspace');
    document.body.classList.toggle('workspace-is-loading', state === 'loading');
    if (refresh) {
        refresh.disabled = state === 'loading';
        refresh.setAttribute('aria-busy', String(state === 'loading'));
    }
    if (!status) return;
    status.hidden = state === 'ready';
    status.classList.toggle('is-error', state === 'error');
    status.textContent = message || (state === 'loading' ? '正在讀取回饋資料…' : '');
}

async function refreshWorkspace() {
    if (document.getElementById('refresh-workspace')?.disabled) return;
    await loadFeedbacks();
    const target = document.querySelector('.sidebar-link.active')?.id.replace('nav-', '');
    if (target === 'airules') await loadRules();
    if (target === 'recycle') await loadRecycleBin();
}

function selectAnalysisView(view, focusTab = false) {
    if (!['overview', 'affect', 'jdr'].includes(view)) return;
    activeAnalysisView = view;
    document.querySelectorAll('.analysis-tab').forEach(tab => {
        const selected = tab.id === `analysis-tab-${view}`;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focusTab) tab.focus();
    });
    document.querySelectorAll('[data-analysis-panel]').forEach(panel => {
        panel.hidden = panel.dataset.analysisPanel !== view;
    });
    requestAnimationFrame(() => {
        drawDashboardCharts();
        requestAnimationFrame(() => {
            if (typeof Chart === 'undefined') return;
            document.querySelectorAll(`#analysis-panel-${view} canvas`).forEach(canvas => {
                const chart = Chart.getChart(canvas);
                const container = canvas.parentElement;
                if (chart && container.clientWidth && container.clientHeight) {
                    chart.resize(container.clientWidth, container.clientHeight);
                    chart.update('none');
                }
            });
        });
    });
}

function updateWorkspaceBrief(data) {
    const heading = document.getElementById('brief-heading');
    const description = document.getElementById('brief-description');
    if (!heading || !description) return;
    const negative = data.filter(item => item.sentiment === 'Negative');
    const counts = new Map();
    negative.forEach(item => {
        const key = item.category || '未分類';
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const maximum = sorted[0]?.[1] || 0;
    const leaders = sorted.filter(([, count]) => count === maximum).map(([name]) => name);
    document.getElementById('brief-negative-count').textContent = `${negative.length} 筆`;
    document.getElementById('brief-negative-share').textContent = data.length
        ? `占目前回饋 ${Math.round(negative.length / data.length * 100)}%` : '目前範圍無資料';
    if (!data.length) {
        heading.textContent = '目前條件下沒有回饋';
        description.textContent = '調整上方的部門、議題或日期，或清除組織概況的圖表篩選。';
    } else if (!negative.length) {
        heading.textContent = '目前範圍沒有負向回饋';
        description.textContent = `本次共檢視 ${data.length} 筆回饋，可由下方圖表進一步了解情緒與議題組成。`;
    } else {
        heading.textContent = leaders.length === 1 ? `${leaders[0]}，值得進一步了解` : '多項議題同樣值得關注';
        description.textContent = `${leaders.join('、')}在負向回饋中${leaders.length > 1 ? '並列最多，各有' : '最多，共有'} ${maximum} 筆。建議搭配部門分布與原始回饋，了解具體情境。`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = '"IBM Plex Sans", "Noto Sans TC", sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#67778a';
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;
    }
    document.querySelector('.analysis-navigation')?.addEventListener('keydown', event => {
        const views = ['overview', 'affect', 'jdr'];
        const index = views.indexOf(activeAnalysisView);
        const targets = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 };
        if (!(event.key in targets)) return;
        event.preventDefault();
        selectAnalysisView(views[targets[event.key]], true);
    });
});
