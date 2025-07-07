// Chart Management System
const chartRegistry = {};

function initializeChart(chartId, config) {
    const ctx = document.getElementById(chartId).getContext('2d');
    
    // Destroy existing chart if it exists
    if (chartRegistry[chartId]) {
        chartRegistry[chartId].destroy();
    }
    
    // Create new chart instance
    chartRegistry[chartId] = new Chart(ctx, {
        type: config.type || 'line',
        data: {
            labels: config.labels || [],
            datasets: [{
                label: config.label || '',
                data: config.data || [],
                backgroundColor: config.backgroundColor || 'rgba(54, 162, 235, 0.2)',
                borderColor: config.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: config.borderWidth || 2,
                tension: config.tension || 0.4,
                fill: config.fill || false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: config.legendPosition || 'top',
                },
                tooltip: {
                    mode: config.tooltipMode || 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: config.beginAtZero !== false,
                    min: config.minValue,
                    max: config.maxValue,
                    title: {
                        display: !!config.yAxisTitle,
                        text: config.yAxisTitle || ''
                    }
                }
            }
        }
    });
}

function updateChartData(chartId, labels, data) {
    if (!chartRegistry[chartId]) return;
    
    const chart = chartRegistry[chartId];
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

// Analytics Data Processing
function processAnalyticsData(consumptionData) {
    if (!consumptionData || consumptionData.length === 0) {
        return null;
    }

    return {
        labels: consumptionData.map(item => item.month),
        fuelData: consumptionData.map(item => item.total_fuel || 0),
        efficiencyData: consumptionData.map(item => item.avg_efficiency || 0),
        stats: {
            totalFuel: consumptionData.reduce((sum, item) => sum + (item.total_fuel || 0), 0),
            avgEfficiency: consumptionData.reduce((sum, item) => sum + (item.avg_efficiency || 0), 0) / 
                          consumptionData.length
        }
    };
}

// Analytics Dashboard Initialization
async function initializeAnalyticsDashboard() {
    if (!document.getElementById('fuelConsumptionChart')) return;

    try {
        // Show loading state
        showChartLoadingState();
        
        // Load initial data
        await loadAndRenderAnalyticsData();
        
        // Set up filter event listeners
        document.getElementById('analyticsFilter')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await loadAndRenderAnalyticsData();
        });

    } catch (error) {
        console.error('Analytics initialization failed:', error);
        showChartErrorState(error.message);
    }
}

async function loadAndRenderAnalyticsData() {
    try {
        const filters = getCurrentFilters();
        const consumptionData = await fetchAnalyticsData(filters);
        const processedData = processAnalyticsData(consumptionData);

        if (!processedData) {
            showNoDataMessage();
            return;
        }

        // Update charts
        updateFuelCharts(processedData);
        updateQuickStats(processedData.stats);

    } catch (error) {
        console.error('Failed to load analytics data:', error);
        throw error;
    }
}

function getCurrentFilters() {
    return {
        vehicleId: document.getElementById('vehicleFilter')?.value || 'all',
        period: document.getElementById('timeFilter')?.value || '30days'
    };
}

async function fetchAnalyticsData({ vehicleId, period }) {
    let url = `/analytics/fuel_consumption?period=${encodeURIComponent(period)}`;
    if (vehicleId !== 'all') {
        url += `&vehicle_id=${encodeURIComponent(vehicleId)}`;
    }

    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `API request failed with status ${response.status}`);
    }

    return await response.json();
}

function updateFuelCharts({ labels, fuelData, efficiencyData }) {
    // Fuel Consumption Chart
    initializeChart('fuelConsumptionChart', {
        type: 'line',
        label: 'Fuel Consumption (L)',
        labels,
        data: fuelData,
        backgroundColor: 'rgba(13, 110, 253, 0.2)',
        borderColor: 'rgba(13, 110, 253, 1)',
        yAxisTitle: 'Liters',
        fill: true
    });

    // Efficiency Chart
    initializeChart('efficiencyChart', {
        type: 'line',
        label: 'Fuel Efficiency (L/100km)',
        labels,
        data: efficiencyData,
        backgroundColor: 'rgba(25, 135, 84, 0.2)',
        borderColor: 'rgba(25, 135, 84, 1)',
        yAxisTitle: 'L/100km',
        beginAtZero: false
    });
}

function updateQuickStats({ totalFuel, avgEfficiency }) {
    const estimatedDistance = totalFuel > 0 && avgEfficiency > 0 
        ? (totalFuel / avgEfficiency) * 100 
        : 0;

    updateStatElement('totalDistance', `${estimatedDistance.toFixed(0)} km`);
    updateStatElement('avgEfficiency', `${avgEfficiency.toFixed(1)} L/100km`);
    updateStatElement('totalFuel', `${totalFuel.toFixed(1)} L`);
}

function updateStatElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value;
}

// UI State Management
function showChartLoadingState() {
    const containers = [
        'fuelConsumptionChart',
        'efficiencyChart',
        'costChart',
        'tripPurposeChart'
    ].map(id => document.getElementById(id)?.parentElement);

    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = `
            <div class="chart-loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
    });
}

function showChartErrorState(message) {
    const container = document.getElementById('fuelConsumptionChart')?.parentElement;
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-error alert alert-danger">
            <i class="bi bi-exclamation-triangle-fill"></i>
            <p>${message || 'Failed to load chart data'}</p>
            <button class="btn btn-sm btn-outline-danger" onclick="window.location.reload()">
                Try Again
            </button>
        </div>
    `;
}

function showNoDataMessage() {
    const container = document.getElementById('fuelConsumptionChart')?.parentElement;
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-empty alert alert-info">
            <i class="bi bi-info-circle-fill"></i>
            <p>No data available for selected filters</p>
        </div>
    `;
}

// Initialize Static Charts
function initializeStaticCharts() {
    // Cost Breakdown Chart
    initializeChart('costChart', {
        type: 'bar',
        label: 'Monthly Cost ($)',
        labels: ['Fuel', 'Maintenance', 'Insurance', 'Taxes'],
        data: [150, 80, 120, 30],
        backgroundColor: [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)',
            'rgba(75, 192, 192, 0.7)'
        ],
        borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)'
        ],
        legendPosition: 'none',
        yAxisTitle: 'USD'
    });

    // Trip Distribution Chart
    initializeChart('tripPurposeChart', {
        type: 'doughnut',
        label: 'Trip Distribution',
        labels: ['Commute', 'Business', 'Personal', 'Vacation'],
        data: [45, 25, 20, 10],
        backgroundColor: [
            'rgba(13, 110, 253, 0.7)',
            'rgba(108, 117, 125, 0.7)',
            'rgba(25, 135, 84, 0.7)',
            'rgba(220, 53, 69, 0.7)'
        ],
        borderColor: [
            'rgba(13, 110, 253, 1)',
            'rgba(108, 117, 125, 1)',
            'rgba(25, 135, 84, 1)',
            'rgba(220, 53, 69, 1)'
        ],
        tooltipMode: 'point'
    });
}

// Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize analytics dashboard if on analytics page
    if (document.getElementById('fuelConsumptionChart')) {
        initializeAnalyticsDashboard();
    }

    // Initialize static charts if they exist
    if (document.getElementById('costChart')) {
        initializeStaticCharts();
    }
});

// Make functions available globally for HTML onclick handlers
window.updateChartsWithRealData = loadAndRenderAnalyticsData;