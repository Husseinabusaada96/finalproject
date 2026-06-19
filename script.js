
const WORLD_GEOJSON_URL =
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";


const WORLD_BANK_API =
    "https://api.worldbank.org/v2/country/all/indicator/";


const indicators = {
    "SP.DYN.LE00.IN": {
        name: "Life Expectancy at Birth",
        unit: "years",
        description:
            "Life expectancy at birth shows the average number of years a newborn is expected to live.",
        direction: "positive"
    },
    "SH.DYN.MORT": {
        name: "Under-5 Mortality Rate",
        unit: "per 1,000 live births",
        description:
            "Under-5 mortality rate shows the probability per 1,000 that a newborn baby will die before reaching age five.",
        direction: "negative"
    },
    "SH.XPD.CHEX.PC.CD": {
        name: "Health Expenditure per Capita",
        unit: "current US$",
        description:
            "Current health expenditure per capita shows the average health expenditure per person in current US dollars.",
        direction: "positive"
    }
};


let map;
let geojsonLayer;
let worldGeoJsonData;
let countryValues = {};
let currentIndicator = "SP.DYN.LE00.IN";
let currentYear = "2021";
let currentBreaks = [];


const positivePalette = ["#f7d6d0", "#f4a7a0", "#f6d365", "#9bd18b", "#1a9850"];
const negativePalette = ["#1a9850", "#9bd18b", "#f6d365", "#f4a7a0", "#c0392b"];
const noDataColor = "#d9d9d9";


const indicatorSelect = document.getElementById("indicatorSelect");
const yearSlider = document.getElementById("yearSlider");
const yearValue = document.getElementById("yearValue");
const countrySearch = document.getElementById("countrySearch");
const loadingMessage = document.getElementById("loadingMessage");
const indicatorDescription = document.getElementById("indicatorDescription");
const legendDiv = document.getElementById("legend");

const countryCountSpan = document.getElementById("countryCount");
const minValueSpan = document.getElementById("minValue");
const maxValueSpan = document.getElementById("maxValue");
const avgValueSpan = document.getElementById("avgValue");


function initializeMap() {
    map = L.map("map", {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 8
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
}



async function loadWorldBoundaries() {
    const response = await fetch(WORLD_GEOJSON_URL);

    if (!response.ok) {
        throw new Error("Could not load world country boundaries.");
    }

    worldGeoJsonData = await response.json();

    geojsonLayer = L.geoJSON(worldGeoJsonData, {
        style: countryStyle,
        onEachFeature: onEachCountry
    }).addTo(map);
}



async function fetchWorldBankData(indicatorCode, year) {
    showLoading(`Loading ${indicators[indicatorCode].name} data for ${year}...`);

    const url =
        `${WORLD_BANK_API}${indicatorCode}` +
        `?format=json&date=${year}&per_page=20000`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("World Bank API request failed.");
    }

    const json = await response.json();

  
    const records = json[1];

    if (!records || !Array.isArray(records)) {
        throw new Error("No data returned from World Bank API.");
    }

    countryValues = {};

    records.forEach((record) => {
        const iso3 = record.countryiso3code;
        const value = record.value;

        if (iso3 && iso3.length === 3 && value !== null) {
            countryValues[iso3] = Number(value);
        }
    });

    calculateBreaks();
    updateMap();
    updateLegend();
    updateStats();
    updateDescription();

    hideLoading();
}



function getCountryCode(feature) {
    return feature.id || feature.properties.ISO_A3 || feature.properties.ADM0_A3;
}

function getCountryName(feature) {
    return (
        feature.properties.name ||
        feature.properties.NAME ||
        feature.properties.ADMIN ||
        "Unknown Country"
    );
}

function getCountryValue(feature) {
    const iso3 = getCountryCode(feature);
    return countryValues[iso3];
}



function countryStyle(feature) {
    const value = getCountryValue(feature);

    return {
        fillColor: getColor(value),
        weight: 0.6,
        opacity: 1,
        color: "#ffffff",
        fillOpacity: value === undefined ? 0.55 : 0.8
    };
}

function getColor(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return noDataColor;
    }

    if (currentBreaks.length < 5) {
        return noDataColor;
    }

    const selectedIndicator = indicators[currentIndicator];
    const palette =
        selectedIndicator.direction === "positive"
            ? positivePalette
            : negativePalette;

    if (value <= currentBreaks[1]) return palette[0];
    if (value <= currentBreaks[2]) return palette[1];
    if (value <= currentBreaks[3]) return palette[2];
    if (value <= currentBreaks[4]) return palette[3];

    return palette[4];
}

function calculateBreaks() {
    const values = Object.values(countryValues).filter(
        (value) => value !== null && !isNaN(value)
    );

    if (values.length === 0) {
        currentBreaks = [];
        return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
        currentBreaks = [min, min, min, min, min];
        return;
    }

    const interval = (max - min) / 5;

    currentBreaks = [
        min,
        min + interval,
        min + interval * 2,
        min + interval * 3,
        min + interval * 4,
        max
    ];
}

function updateMap() {
    if (geojsonLayer) {
        geojsonLayer.setStyle(countryStyle);
    }
}



function onEachCountry(feature, layer) {
    layer.on({
        mouseover: function (event) {
            const targetLayer = event.target;

            targetLayer.setStyle({
                weight: 2,
                color: "#333333",
                fillOpacity: 0.95
            });

            targetLayer.bindPopup(createPopupContent(feature)).openPopup();
        },

        mouseout: function (event) {
            geojsonLayer.resetStyle(event.target);
            map.closePopup();
        },

        click: function (event) {
            map.fitBounds(event.target.getBounds(), {
                padding: [30, 30]
            });
        }
    });
}

function createPopupContent(feature) {
    const countryName = getCountryName(feature);
    const iso3 = getCountryCode(feature);
    const value = getCountryValue(feature);
    const indicator = indicators[currentIndicator];

    if (value === undefined || value === null || isNaN(value)) {
        return `
            <div class="popup-title">${countryName}</div>
            <div><strong>ISO3:</strong> ${iso3}</div>
            <div class="no-data">No data available for ${currentYear}</div>
        `;
    }

    return `
        <div class="popup-title">${countryName}</div>
        <div><strong>ISO3:</strong> ${iso3}</div>
        <div><strong>Indicator:</strong> ${indicator.name}</div>
        <div><strong>Year:</strong> ${currentYear}</div>
        <div>
            <strong>Value:</strong>
            <span class="popup-value">${formatNumber(value)} ${indicator.unit}</span>
        </div>
    `;
}



function updateLegend() {
    legendDiv.innerHTML = "";

    if (currentBreaks.length === 0) {
        legendDiv.innerHTML = "<p>No data available.</p>";
        return;
    }

    const indicator = indicators[currentIndicator];
    const palette =
        indicator.direction === "positive" ? positivePalette : negativePalette;

    for (let i = 0; i < 5; i++) {
        const from = currentBreaks[i];
        const to = currentBreaks[i + 1];

        const item = document.createElement("div");
        item.className = "legend-item";

        item.innerHTML = `
            <span class="legend-color" style="background:${palette[i]}"></span>
            <span>${formatNumber(from)} - ${formatNumber(to)} ${indicator.unit}</span>
        `;

        legendDiv.appendChild(item);
    }

    const noDataItem = document.createElement("div");
    noDataItem.className = "legend-item";
    noDataItem.innerHTML = `
        <span class="legend-color" style="background:${noDataColor}"></span>
        <span>No Data</span>
    `;

    legendDiv.appendChild(noDataItem);
}



function updateStats() {
    const values = Object.values(countryValues).filter(
        (value) => value !== null && !isNaN(value)
    );

    if (values.length === 0) {
        countryCountSpan.textContent = "-";
        minValueSpan.textContent = "-";
        maxValueSpan.textContent = "-";
        avgValueSpan.textContent = "-";
        return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((total, value) => total + value, 0);
    const avg = sum / values.length;

    const unit = indicators[currentIndicator].unit;

    countryCountSpan.textContent = values.length;
    minValueSpan.textContent = `${formatNumber(min)} ${unit}`;
    maxValueSpan.textContent = `${formatNumber(max)} ${unit}`;
    avgValueSpan.textContent = `${formatNumber(avg)} ${unit}`;
}

function updateDescription() {
    indicatorDescription.textContent = indicators[currentIndicator].description;
}



function searchCountry(searchText) {
    if (!searchText || !geojsonLayer) return;

    const query = searchText.toLowerCase().trim();
    let foundLayer = null;

    geojsonLayer.eachLayer((layer) => {
        const countryName = getCountryName(layer.feature).toLowerCase();

        if (countryName.includes(query)) {
            foundLayer = layer;
        }
    });

    if (foundLayer) {
        map.fitBounds(foundLayer.getBounds(), {
            padding: [30, 30]
        });

        foundLayer.setStyle({
            weight: 3,
            color: "#000000",
            fillOpacity: 1
        });

        foundLayer.bindPopup(createPopupContent(foundLayer.feature)).openPopup();

        setTimeout(() => {
            geojsonLayer.resetStyle(foundLayer);
        }, 2500);
    }
}



indicatorSelect.addEventListener("change", async function () {
    currentIndicator = this.value;

    try {
        await fetchWorldBankData(currentIndicator, currentYear);
    } catch (error) {
        handleError(error);
    }
});

yearSlider.addEventListener("input", function () {
    yearValue.textContent = this.value;
});

yearSlider.addEventListener("change", async function () {
    currentYear = this.value;

    try {
        await fetchWorldBankData(currentIndicator, currentYear);
    } catch (error) {
        handleError(error);
    }
});

countrySearch.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        searchCountry(this.value);
    }
});



function formatNumber(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return "No data";
    }

    if (Math.abs(value) >= 1000) {
        return value.toLocaleString(undefined, {
            maximumFractionDigits: 0
        });
    }

    return value.toLocaleString(undefined, {
        maximumFractionDigits: 2
    });
}

function showLoading(message) {
    loadingMessage.style.display = "block";
    loadingMessage.textContent = message;
}

function hideLoading() {
    loadingMessage.style.display = "none";
}

function handleError(error) {
    console.error(error);

    loadingMessage.style.display = "block";
    loadingMessage.textContent =
        "Error loading data. Please check your internet connection or try another year.";
}



async function startApp() {
    try {
        initializeMap();
        await loadWorldBoundaries();
        await fetchWorldBankData(currentIndicator, currentYear);
    } catch (error) {
        handleError(error);
    }
}

startApp();