class CurrencyConverter {
    constructor() {
        this.apiUrl = 'https://api.frankfurter.app';
        this.currencies = {};
        this.exchangeRates = {};
        this.autoConvertTimeout = null;
        this.isConverting = false;
        this.init();
    }

    async init() {
        try {
            await this.loadCurrencies();
            this.setupEventListeners();
            this.setDefaultValues();
        } catch (error) {
            console.error('Initialization error:', error);
            // Even if loading currencies fails, we can still set up the UI
            this.setupEventListeners();
            this.setDefaultValues();
            this.showError('Some features may be limited due to network issues.');
        }
    }

    async loadCurrencies() {
        const maxRetries = 3;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Add timeout to prevent hanging requests
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                
                const response = await fetch(`${this.apiUrl}/currencies`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                this.currencies = await response.json();
                this.populateCurrencyDropdowns();
                return; // Success, exit the function
                
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                lastError = error;
                
                // Wait before retrying (exponential backoff)
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        
        // All retries failed, use fallback
        console.error('All attempts to load currencies failed, using fallback');
        
        // Fallback to common currencies if API fails
        this.currencies = {
            'USD': 'US Dollar',
            'EUR': 'Euro',
            'GBP': 'British Pound',
            'JPY': 'Japanese Yen',
            'CAD': 'Canadian Dollar',
            'AUD': 'Australian Dollar',
            'CHF': 'Swiss Franc',
            'CNY': 'Chinese Yuan',
            'INR': 'Indian Rupee',
            'BRL': 'Brazilian Real',
            'MXN': 'Mexican Peso',
            'SGD': 'Singapore Dollar',
            'HKD': 'Hong Kong Dollar',
            'NZD': 'New Zealand Dollar',
            'SEK': 'Swedish Krona',
            'KRW': 'South Korean Won',
            'RUB': 'Russian Ruble',
            'TRY': 'Turkish Lira',
            'ZAR': 'South African Rand',
            'NOK': 'Norwegian Krone'
        };
        
        this.populateCurrencyDropdowns();
        this.showError('Using fallback currency list. Some features may be limited.');
    }

    populateCurrencyDropdowns() {
        const fromSelect = document.getElementById('fromCurrency');
        const toSelect = document.getElementById('toCurrency');
        
        // Clear existing options except placeholder
        fromSelect.innerHTML = '<option value="">Select currency...</option>';
        toSelect.innerHTML = '<option value="">Select currency...</option>';
        
        // Sort currencies by code
        const sortedCurrencies = Object.entries(this.currencies).sort(([a], [b]) => a.localeCompare(b));
        
        sortedCurrencies.forEach(([code, name]) => {
            const option1 = new Option(`${code} - ${name}`, code);
            const option2 = new Option(`${code} - ${name}`, code);
            fromSelect.appendChild(option1);
            toSelect.appendChild(option2);
        });
    }

    setDefaultValues() {
        document.getElementById('fromCurrency').value = 'USD';
        document.getElementById('toCurrency').value = 'EUR';
        document.getElementById('amount').value = '100';
    }

    setupEventListeners() {
        const form = document.getElementById('converterForm');
        const swapBtn = document.getElementById('swapBtn');
        const insightBtn = document.getElementById('insightBtn');
        
        // Remove any existing event listeners to prevent duplicates
        form.removeEventListener('submit', this.handleFormSubmit);
        swapBtn.removeEventListener('click', this.swapCurrencies);
        insightBtn.removeEventListener('click', this.showCurrencyInsight);
        
        // Add event listeners
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        swapBtn.addEventListener('click', () => this.swapCurrencies());
        insightBtn.addEventListener('click', () => this.showCurrencyInsight());
        
        // Auto-convert on value change
        const autoConvertElements = ['amount', 'fromCurrency', 'toCurrency'];
        autoConvertElements.forEach(id => {
            const element = document.getElementById(id);
            // Remove existing listeners
            element.removeEventListener('change', this.handleAutoConvert);
            element.removeEventListener('input', this.handleAutoConvert);
            
            // Add new listeners
            element.addEventListener('change', () => this.handleAutoConvert());
            element.addEventListener('input', () => this.handleAutoConvert());
        });
    }

    handleAutoConvert() {
        // Debounce the auto-convert to prevent too many API calls
        clearTimeout(this.autoConvertTimeout);
        this.autoConvertTimeout = setTimeout(() => {
            if (this.isFormValid(false)) {
                this.convertCurrency();
            }
        }, 500); // 500ms delay
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (this.validateForm()) {
            await this.convertCurrency();
        }
    }

    validateForm() {
        const fromCurrency = document.getElementById('fromCurrency');
        const toCurrency = document.getElementById('toCurrency');
        const amount = document.getElementById('amount');
        
        let isValid = true;
        
        // Clear previous validation states
        [fromCurrency, toCurrency, amount].forEach(field => {
            field.classList.remove('is-invalid');
        });
        
        this.hideError();
        
        // Validate from currency
        if (!fromCurrency.value) {
            fromCurrency.classList.add('is-invalid');
            isValid = false;
        }
        
        // Validate to currency
        if (!toCurrency.value) {
            toCurrency.classList.add('is-invalid');
            isValid = false;
        }
        
        // Validate amount
        if (!amount.value || parseFloat(amount.value) <= 0) {
            amount.classList.add('is-invalid');
            isValid = false;
        }
        
        // Check if currencies are the same
        if (fromCurrency.value && toCurrency.value && fromCurrency.value === toCurrency.value) {
            this.showError('Please select different currencies for conversion.');
            fromCurrency.classList.add('is-invalid');
            toCurrency.classList.add('is-invalid');
            isValid = false;
        }
        
        return isValid;
    }

    isFormValid(showErrors = true) {
        const fromCurrency = document.getElementById('fromCurrency');
        const toCurrency = document.getElementById('toCurrency');
        const amount = document.getElementById('amount');
        
        const hasValidCurrencies = fromCurrency.value && toCurrency.value && fromCurrency.value !== toCurrency.value;
        const hasValidAmount = amount.value && parseFloat(amount.value) > 0;
        
        return hasValidCurrencies && hasValidAmount;
    }

    async convertCurrency() {
        // Prevent multiple simultaneous requests
        if (this.isConverting) {
            return;
        }
        
        const amount = parseFloat(document.getElementById('amount').value);
        const fromCurrency = document.getElementById('fromCurrency').value;
        const toCurrency = document.getElementById('toCurrency').value;
        
        // Validate inputs before making request
        if (!amount || !fromCurrency || !toCurrency || fromCurrency === toCurrency) {
            return;
        }
        
        this.isConverting = true;
        this.setLoading(true);
        this.hideError();
        
        try {
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(
                `${this.apiUrl}/latest?amount=${amount}&from=${fromCurrency}&to=${toCurrency}`,
                { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.displayResult(data, amount, fromCurrency, toCurrency);
            
        } catch (error) {
            console.error('Conversion error:', error);
            
            // Provide more specific error messages
            if (error.name === 'AbortError') {
                this.showError('Request timed out. Please check your connection and try again.');
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.showError('Network error: Please check your internet connection and try again.');
            } else if (error.message.includes('HTTP error! status: 429')) {
                this.showError('Too many requests. Please wait a moment and try again.');
            } else if (error.message.includes('HTTP error! status: 500')) {
                this.showError('Server error. Please try again later.');
            } else {
                this.showError('Failed to convert currency. Please check your connection and try again.');
            }
        } finally {
            this.isConverting = false;
            this.setLoading(false);
        }
    }

    displayResult(data, originalAmount, fromCurrency, toCurrency) {
        const resultSection = document.getElementById('resultSection');
        const resultAmount = document.getElementById('resultAmount');
        const resultDetails = document.getElementById('resultDetails');
        const exchangeRate = document.getElementById('exchangeRate');
        
        const convertedAmount = data.rates[toCurrency];
        const rate = convertedAmount / originalAmount;
        
        // Format currency values
        const formattedConverted = this.formatCurrency(convertedAmount, toCurrency);
        const formattedOriginal = this.formatCurrency(originalAmount, fromCurrency);
        const formattedRate = this.formatNumber(rate, 6);
        
        resultAmount.textContent = formattedConverted;
        resultDetails.textContent = `${formattedOriginal} equals`;
        exchangeRate.textContent = `1 ${fromCurrency} = ${formattedRate} ${toCurrency}`;
        
        // Show result with animation
        resultSection.style.display = 'block';
        resultSection.classList.add('fade-in');
        
        setTimeout(() => {
            resultSection.classList.remove('fade-in');
        }, 500);
    }

    formatCurrency(amount, currency) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatNumber(number, maxDecimals = 2) {
        return parseFloat(number).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: maxDecimals
        });
    }

    swapCurrencies() {
        const fromCurrency = document.getElementById('fromCurrency');
        const toCurrency = document.getElementById('toCurrency');
        
        const temp = fromCurrency.value;
        fromCurrency.value = toCurrency.value;
        toCurrency.value = temp;
        
        // Auto-convert if form is valid
        if (this.isFormValid(false)) {
            this.convertCurrency();
        }
    }

    async showCurrencyInsight() {
        const fromCurrency = document.getElementById('fromCurrency').value;
        const toCurrency = document.getElementById('toCurrency').value;
        
        if (!fromCurrency || !toCurrency) {
            this.showError('Please select both currencies to get insights.');
            return;
        }
        
        if (fromCurrency === toCurrency) {
            this.showError('Please select different currencies for insights.');
            return;
        }
        
        try {
            // Get historical data for the past week
            const today = new Date();
            const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const fromDate = lastWeek.toISOString().split('T')[0];
            const toDate = today.toISOString().split('T')[0];
            
            const response = await fetch(
                `${this.apiUrl}/${fromDate}..${toDate}?from=${fromCurrency}&to=${toCurrency}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.displayInsight(data, fromCurrency, toCurrency);
            
        } catch (error) {
            console.error('Insight error:', error);
            this.showError('Unable to fetch currency insights at the moment.');
        }
    }

    displayInsight(data, fromCurrency, toCurrency) {
        const rates = Object.values(data.rates).map(rate => rate[toCurrency]).filter(Boolean);
        
        if (rates.length === 0) {
            this.showError('No historical data available for selected currencies.');
            return;
        }
        
        const minRate = Math.min(...rates);
        const maxRate = Math.max(...rates);
        const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
        const currentRate = rates[rates.length - 1];
        
        const trend = rates.length > 1 ? 
            (currentRate > rates[0] ? 'up' : currentRate < rates[0] ? 'down' : 'stable') : 'stable';
        
        const trendIcon = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
        const trendText = trend === 'up' ? 'increasing' : trend === 'down' ? 'decreasing' : 'stable';
        
        const insightMessage = `
            ${trendIcon} 7-day insight for ${fromCurrency}/${toCurrency}:
            Current: ${this.formatNumber(currentRate, 6)}
            Trend: ${trendText}
            Range: ${this.formatNumber(minRate, 6)} - ${this.formatNumber(maxRate, 6)}
            Average: ${this.formatNumber(avgRate, 6)}
        `;
        
        alert(insightMessage);
    }

    setLoading(isLoading) {
        const convertBtn = document.getElementById('convertBtn');
        const spinner = document.getElementById('loadingSpinner');
        
        if (isLoading) {
            convertBtn.disabled = true;
            spinner.style.display = 'inline-block';
            convertBtn.textContent = '';
            convertBtn.appendChild(spinner);
            convertBtn.appendChild(document.createTextNode('Converting...'));
        } else {
            convertBtn.disabled = false;
            spinner.style.display = 'none';
            // Properly restore the button content
            convertBtn.innerHTML = '<div class="loading-spinner" id="loadingSpinner"></div>Convert';
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        
        errorText.textContent = message;
        errorDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CurrencyConverter();
}); 