function buildDashboardMarkupV2View({
    ownerOptions,
    totalLeads,
    totalValue,
    totalWon,
    wonLeads,
    lostLeads,
    activeLeads,
    activeValue,
    conversion,
    avgWonTicket
}: {
    ownerOptions: Array<{ value: string; label: string }>;
    totalLeads: number;
    totalValue: number;
    totalWon: number;
    wonLeads: LeadRecord[];
    lostLeads: LeadRecord[];
    activeLeads: LeadRecord[];
    activeValue: number;
    conversion: string;
    avgWonTicket: number;
}) {
    return `
        <section class="dash-overview">
            <div class="dash-hero-card">
                <div class="dash-hero-copy">
                    <span class="dash-kicker">Dashboard Comercial</span>
                    <h2>Visão geral da operação</h2>
                    <p>Acompanhe o funil, o valor em aberto e o desempenho de fechamento em um painel mais claro e mais direto.</p>
                </div>
                <div class="dash-hero-actions">
                    <div class="dash-filters">
                        <label>Consultor</label>
                        <select id="dash-owner" onchange="setDashboardOwnerFilter(this.value)">
                            ${ownerOptions.map((o) => `<option value="${o.value}" ${o.value === dashboardOwnerFilter ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="dash-hero-note">
                        <span class="label">Pipeline em aberto</span>
                        <strong>R$ ${activeValue.toLocaleString()}</strong>
                        <small>${activeLeads.length} lead(s) ativos</small>
                    </div>
                </div>
            </div>

            <div class="dash-focus-card">
                <span class="dash-focus-label">Resumo rápido</span>
                <strong>R$ ${totalWon.toLocaleString()}</strong>
                <small>valor total fechado no filtro atual</small>
                <div class="dash-mini-stats">
                    <div class="dash-mini-stat">
                        <span>Taxa de ganho</span>
                        <strong>${conversion}%</strong>
                    </div>
                    <div class="dash-mini-stat">
                        <span>Perdidos</span>
                        <strong>${lostLeads.length}</strong>
                    </div>
                </div>
            </div>
        </section>

        <div class="dash-grid dash-kpis">
            <div class="stat-card">
                <span class="stat-icon"><i class="ph ph-wallet"></i></span>
                <span class="label">Pipeline Total</span>
                <span class="value">R$ ${totalValue.toLocaleString()}</span>
                <span class="meta">${totalLeads} lead(s) no periodo</span>
            </div>
            <div class="stat-card success">
                <span class="stat-icon"><i class="ph ph-trophy"></i></span>
                <span class="label">Vendas Ganhas</span>
                <span class="value">R$ ${totalWon.toLocaleString()}</span>
                <span class="meta">${wonLeads.length} fechamento(s)</span>
            </div>
            <div class="stat-card info">
                <span class="stat-icon"><i class="ph ph-chart-line-up"></i></span>
                <span class="label">Leads Ativos</span>
                <span class="value">${activeLeads.length}</span>
                <span class="meta">R$ ${activeValue.toLocaleString()} em aberto</span>
            </div>
            <div class="stat-card warning">
                <span class="stat-icon"><i class="ph ph-target"></i></span>
                <span class="label">Conversao / Ticket Medio</span>
                <span class="value">${conversion}%</span>
                <span class="meta">R$ ${avgWonTicket.toLocaleString()} por venda</span>
            </div>
        </div>

        <div class="dash-layout">
            <div class="chart-section dash-chart-panel">
                <div class="chart-controls">
                    <div>
                        <h4>Distribuicao financeira do funil</h4>
                        <div class="hint">Visual principal do dashboard. Compare rapidamente onde o valor comercial esta concentrado.</div>
                    </div>
                    <select id="chart-type" onchange="setChartType(this.value)">
                        <option value="bar">Colunas</option>
                        <option value="line">Linhas</option>
                        <option value="doughnut">Rosca</option>
                    </select>
                </div>
                <div class="chart-canvas">
                    <canvas id="salesChart"></canvas>
                </div>
            </div>
        </div>
    `;
}

function renderDashboardView(container: HTMLElement) {
    const viewLeads = getDashboardLeads();
    const ownerOptions = getDashboardOwnerOptions();
    const totalLeads = viewLeads.length;
    const totalValue = viewLeads.reduce((acc, curr) => acc + Number(curr.value), 0);
    const wonLeads = viewLeads.filter((lead) => lead.stage === 'Fechado');
    const lostLeads = viewLeads.filter((lead) => lead.stage === 'Perdido');
    const totalWon = wonLeads.reduce((acc, curr) => acc + Number(curr.value), 0);
    const activeLeads = viewLeads.filter((lead) => lead.stage !== 'Fechado' && lead.stage !== 'Perdido');
    const activeValue = activeLeads.reduce((acc, curr) => acc + Number(curr.value), 0);
    const avgWonTicket = wonLeads.length > 0 ? (totalWon / wonLeads.length) : 0;
    const conversion = viewLeads.length > 0 ? ((wonLeads.length / viewLeads.length) * 100).toFixed(1) : '0.0';

    container.innerHTML = buildDashboardMarkupV2View({
        ownerOptions,
        totalLeads,
        totalValue,
        totalWon,
        wonLeads,
        lostLeads,
        activeLeads,
        activeValue,
        conversion,
        avgWonTicket
    });

    const fastSel = document.getElementById('chart-type') as HTMLSelectElement | null;
    if (fastSel) fastSel.value = currentChartType;
    initSalesChartV2Internal(currentChartType, viewLeads);
}

function setChartTypeView(type: string) {
    currentChartType = DASHBOARD_CHART_TYPES.includes(type) ? type : 'bar';
    localStorage.setItem('sov_chart_type', currentChartType);
    initSalesChartV2Internal(currentChartType, getDashboardLeads());
}

function initSalesChartV2Internal(type = 'bar', inputLeads = leads) {
    const canvas = document.getElementById('salesChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeType = DASHBOARD_CHART_TYPES.includes(type) ? type : 'bar';
    const isCircular = safeType === 'doughnut';
    const dataByStage = STAGES.map((stage) => {
        return (Array.isArray(inputLeads) ? inputLeads : [])
            .filter((lead) => lead.stage === stage)
            .reduce((acc, curr) => acc + Number(curr.value || 0), 0);
    });

    if (salesChart) {
        salesChart.destroy();
        salesChart = null;
    }

    const css = getComputedStyle(document.documentElement);
    const textColor = css.getPropertyValue('--text').trim() || '#111827';
    const mutedColor = css.getPropertyValue('--muted').trim() || '#64748b';
    const gridColor = css.getPropertyValue('--border').trim() || '#e2e8f0';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const palette = [
        'rgba(129, 140, 248, 0.90)',
        'rgba(109, 56, 243, 0.90)',
        'rgba(79, 70, 229, 0.90)',
        'rgba(59, 130, 246, 0.90)',
        'rgba(14, 165, 233, 0.90)',
        'rgba(16, 185, 129, 0.90)',
        'rgba(239, 68, 68, 0.90)'
    ];
    const compactMoney = (value: number | string) => {
        const amount = Number(value || 0);
        if (amount >= 1000000) return `R$ ${(amount / 1000000).toFixed(1)} mi`;
        if (amount >= 1000) return `R$ ${(amount / 1000).toFixed(0)} mil`;
        return `R$ ${amount.toLocaleString()}`;
    };

    salesChart = new Chart(ctx, {
        type: safeType,
        data: {
            labels: STAGES,
            datasets: [{
                label: 'Valor Total',
                data: dataByStage,
                backgroundColor: palette,
                borderColor: safeType === 'line' ? '#6d38f3' : palette,
                borderWidth: safeType === 'line' ? 3 : 0,
                borderRadius: safeType === 'bar' ? 14 : 0,
                borderSkipped: false,
                maxBarThickness: 44,
                tension: 0.38,
                pointRadius: safeType === 'line' ? 4 : 0,
                pointHoverRadius: safeType === 'line' ? 6 : 0,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#6d38f3',
                pointBorderWidth: safeType === 'line' ? 3 : 0,
                fill: safeType === 'line',
                cutout: isCircular ? '68%' : undefined,
                spacing: isCircular ? 3 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 8, right: 6, bottom: 0, left: 0 }
            },
            plugins: {
                legend: {
                    display: true,
                    position: isCircular ? 'bottom' : 'top',
                    align: isCircular ? 'center' : 'start',
                    labels: {
                        color: mutedColor,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 18
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: gridColor,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: isCircular,
                    callbacks: {
                        label: (chartCtx: any) => `${chartCtx.label}: ${compactMoney(chartCtx.raw || 0)}`
                    }
                }
            },
            scales: isCircular ? {} : {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    ticks: {
                        color: mutedColor,
                        padding: 10,
                        callback: (value: number) => compactMoney(value)
                    },
                    grid: {
                        color: gridColor,
                        drawBorder: false
                    }
                },
                x: {
                    border: { display: false },
                    ticks: {
                        color: mutedColor,
                        maxRotation: 0,
                        minRotation: 0
                    },
                    grid: { display: false }
                }
            }
        }
    });
}
