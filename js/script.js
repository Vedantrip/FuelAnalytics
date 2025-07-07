const API_BASE_URL = "http://localhost:8000";

// 1. Enhanced API Helper Function
async function apiFetch(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // For potential future auth
        };
        
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Request failed with status ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// 2. Improved Vehicle Loading with Caching
let vehicleCache = null;
async function loadVehicles() {
    try {
        if (!vehicleCache) {
            vehicleCache = await apiFetch('/vehicles');
        }
        
        const selects = document.querySelectorAll('select[id*="vehicle"]');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="" disabled selected>Select Vehicle</option>';
            
            vehicleCache.forEach(vehicle => {
                const option = new Option(
                    `${vehicle.make} ${vehicle.model} (${vehicle.year})`, 
                    vehicle.id
                );
                select.add(option);
            });
            
            if (currentValue) select.value = currentValue;
        });
    } catch (error) {
        showToast('Failed to load vehicles', 'danger');
    }
}

// 3. Toast Notification System
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    const container = document.getElementById('toastContainer') || createToastContainer();
    container.appendChild(toast);
    
    new bootstrap.Toast(toast, { autohide: true, delay: 3000 }).show();
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '11';
    document.body.appendChild(container);
    return container;
}

// 4. Form Handler Factory
function createFormHandler(formId, endpoint, successMessage) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            return;
        }

        try {
            const formData = Object.fromEntries(new FormData(form));
            const numericFields = ['vehicle_id', 'fuel_amount', 'odometer', 'distance', 'duration'];
            
            // Convert numeric fields
            numericFields.forEach(field => {
                if (formData[field]) formData[field] = parseFloat(formData[field]);
            });

            await apiFetch(endpoint, 'POST', formData);
            
            showToast(successMessage);
            form.reset();
            form.classList.remove('was-validated');
            
            // Refresh relevant data
            if (formId === 'fuelLogForm') await loadRecentLogs();
            if (formId === 'tripForm') await loadRecentTrips();
            
        } catch (error) {
            showToast(error.message || 'Submission failed', 'danger');
        }
    });
}

// 5. Enhanced Data Loading with Skeleton UI
async function loadWithSkeleton(loaderFunc, elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = `
        <div class="skeleton-loader">
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
        </div>
    `;

    try {
        await loaderFunc();
    } catch (error) {
        element.innerHTML = `
            <div class="alert alert-danger">
                Failed to load data. <button class="btn btn-sm btn-outline-danger" onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

// 6. Improved Recent Data Display
async function loadRecentLogs() {
    const [logs, vehicles] = await Promise.all([
        apiFetch('/fuel_logs?limit=3'),
        apiFetch('/vehicles')
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
    const container = document.getElementById('recentLogs');
    
    container.innerHTML = logs.length ? `
        <div class="list-group">
            ${logs.map(log => `
                <a href="#" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${vehicleMap[log.vehicle_id]?.make || 'Unknown'} ${vehicleMap[log.vehicle_id]?.model || ''}</h6>
                        <small>${new Date(log.log_date).toLocaleDateString()}</small>
                    </div>
                    <p class="mb-1">${log.fuel_amount}L • ${log.odometer}km</p>
                    ${log.efficiency ? `<small>${log.efficiency.toFixed(1)} L/100km</small>` : ''}
                </a>
            `).join('')}
        </div>
    ` : '<div class="text-muted">No recent logs found</div>';
}

// 7. Chart Management System
const chartInstances = {};

function renderChart(chartId, config) {
    const ctx = document.getElementById(chartId).getContext('2d');
    
    if (chartInstances[chartId]) {
        chartInstances[chartId].destroy();
    }
    
    chartInstances[chartId] = new Chart(ctx, {
        type: config.type || 'line',
        data: {
            labels: config.labels,
            datasets: [{
                label: config.label,
                data: config.data,
                backgroundColor: config.bgColor || 'rgba(54, 162, 235, 0.2)',
                borderColor: config.borderColor || 'rgba(54, 162, 235, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index' }
            },
            scales: {
                y: { beginAtZero: config.beginAtZero !== false }
            }
        }
    });
}

// 8. Initialize Application
async function initApp() {
    // Load essential data
    await Promise.all([
        loadVehicles(),
        loadWithSkeleton(loadRecentLogs, 'recentLogs'),
        loadWithSkeleton(loadRecentTrips, 'recentTrips')
    ]);

    // Initialize forms
    createFormHandler('fuelLogForm', '/fuel_logs', 'Fuel log added successfully!');
    createFormHandler('tripForm', '/trips', 'Trip recorded successfully!');

    // Set default dates
    document.querySelectorAll('input[type="date"]').forEach(input => {
        input.valueAsDate = new Date();
    });

    // Analytics page setup
    if (document.getElementById('analyticsFilter')) {
        document.getElementById('analyticsFilter').addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateAnalytics();
        });
        await updateAnalytics();
    }
}

// 9. Analytics Data Handler
async function updateAnalytics() {
    try {
        const vehicleId = document.getElementById('vehicleFilter').value;
        const period = document.getElementById('timeFilter').value;
        
        const data = await apiFetch(
            `/analytics/fuel_consumption?${vehicleId !== 'all' ? `vehicle_id=${vehicleId}&` : ''}period=${period}`
        );

        if (!data.length) {
            document.getElementById('chartContainer').innerHTML = `
                <div class="alert alert-info">No data available for selected filters</div>
            `;
            return;
        }

        renderChart('fuelConsumptionChart', {
            labels: data.map(d => d.month),
            data: data.map(d => d.total_fuel),
            label: 'Fuel Consumption (L)'
        });

        renderChart('efficiencyChart', {
            labels: data.map(d => d.month),
            data: data.map(d => d.avg_efficiency),
            label: 'Efficiency (L/100km)',
            bgColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)'
        });
    } catch (error) {
        showToast('Failed to load analytics', 'danger');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);

// Utility function for dynamic imports (e.g., for charts)
function loadDependencies() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') return resolve();
        
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}