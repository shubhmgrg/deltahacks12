// Mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1Ijoibm90amFja2wzIiwiYSI6ImNtY3NxOWlkaDE1YXQyanEwYWI0MjZicWYifQ.TmrkcNK6jBFrQ37uJucAAg";

// Initialize map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-95, 40], // Center on US
  zoom: 4,
});

// API base URL
const API_BASE = "http://localhost:5001/api";

let minTimestamp = 0;
let maxTimestamp = 0;
let currentTimestamp = 0;
let startTimestamp = 0;
let isPlaying = false;
let animationFrameId = null;
let startTime = null;
const playbackSpeed = 120; // 120x speed (1 second real = 2 minutes flight time)
const trailMinutes = 30;

// Cache for flight positions (timestamp -> features)
let flightCache = new Map();
let cacheUpdateInterval = 30; // Update cache every 30 seconds of flight time
let lastCacheUpdate = 0;

// Load metadata and initialize
async function initialize() {
  try {
    document.getElementById("cellInfo").innerHTML =
      "<strong>Connecting to backend...</strong>";

    const response = await fetch(`${API_BASE}/metadata`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const metadata = await response.json();
    minTimestamp = metadata.min_timestamp;
    maxTimestamp = metadata.max_timestamp;

    // Start at a time when flights are likely active (middle of day)
    // Find first timestamp with flights by testing a few times
    let startTs = minTimestamp + (maxTimestamp - minTimestamp) * 0.1; // Start at 10% through the day
    currentTimestamp = startTs;
    startTimestamp = startTs;

    console.log("Metadata loaded:", metadata);
    console.log(
      `Time range: ${new Date(minTimestamp * 1000)} to ${new Date(
        maxTimestamp * 1000
      )}`
    );

    // Update slider
    document.getElementById("timeSlider").max = 100;

    // Initialize map
    map.on("load", () => {
      setupLayers();
      // Preload initial data and auto-start animation
      updateCache().then(() => {
        updateDisplay();
        document.getElementById(
          "cellInfo"
        ).innerHTML = `<strong>Ready!</strong><br>${metadata.total_flights} flights loaded<br>Starting timelapse...`;
        // Auto-start animation for continuous movement
        setTimeout(() => {
          isPlaying = true;
          startTime = null;
          startTimestamp = currentTimestamp;
          document.getElementById("playPause").textContent = "⏸ Pause";
          animationFrameId = requestAnimationFrame(animate);
        }, 1000);
      });
    });
  } catch (error) {
    console.error("Error initializing:", error);
    document.getElementById(
      "cellInfo"
    ).innerHTML = `<strong>Error:</strong> Could not connect to backend at ${API_BASE}<br>Make sure Flask server is running!`;
    alert(`Error: ${error.message}\n\nMake sure to run: python backend/app.py`);
  }
}

// Setup map layers
function setupLayers() {
  // Source for current flight positions (dots)
  map.addSource("current-flights", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Source for trails (lines)
  map.addSource("trails", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // Trail layer
  map.addLayer({
    id: "trails-layer",
    type: "line",
    source: "trails",
    paint: {
      "line-color": "#4a90e2",
      "line-width": 2,
      "line-opacity": 0.6,
    },
  });

  // Flight dots layer
  map.addLayer({
    id: "flights-layer",
    type: "circle",
    source: "current-flights",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ff6b6b",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 1,
    },
  });

  // Hover interaction
  map.on("mouseenter", "flights-layer", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const props = e.features[0].properties;
    document.getElementById("cellInfo").innerHTML = `
      <strong>${props.callsign || "Flight"}</strong><br>
      ${props.departure} → ${props.arrival}<br>
      Time: ${new Date(props.timestamp * 1000).toLocaleTimeString()}
    `;
  });

  map.on("mouseleave", "flights-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}

// Update cache from backend
async function updateCache() {
  const timestamp = Math.floor(currentTimestamp);

  // Check if we need to update cache
  if (
    Math.abs(timestamp - lastCacheUpdate) < cacheUpdateInterval &&
    flightCache.has(timestamp)
  ) {
    return; // Cache still valid
  }

  try {
    // Fetch flights for current time and a few seconds ahead for interpolation
    const timestampsToFetch = [];
    for (let i = 0; i < 3; i++) {
      timestampsToFetch.push(timestamp + i * 10); // Every 10 seconds
    }

    // Fetch all needed timestamps
    const fetchPromises = timestampsToFetch.map((ts) =>
      fetch(`${API_BASE}/flights?timestamp=${ts}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch((e) => {
          console.error(`Error fetching ${ts}:`, e);
          return null;
        })
    );

    const results = await Promise.all(fetchPromises);

    // Update cache
    results.forEach((data, i) => {
      if (data && data.features) {
        const ts = timestampsToFetch[i];
        flightCache.set(ts, data.features);
      }
    });

    // Clean old cache entries (keep last 20)
    if (flightCache.size > 20) {
      const sortedKeys = Array.from(flightCache.keys()).sort((a, b) => b - a);
      sortedKeys.slice(20).forEach((key) => flightCache.delete(key));
    }

    lastCacheUpdate = timestamp;
  } catch (error) {
    console.error("Error updating cache:", error);
  }
}

// Get interpolated features for a specific timestamp
function getInterpolatedFeatures(timestamp) {
  const ts = Math.floor(timestamp);
  const nextTs = ts + 1;

  // Get cached data
  const currentFeatures = flightCache.get(ts) || [];
  const nextFeatures = flightCache.get(nextTs) || currentFeatures;

  // If we have exact match, return it
  if (currentFeatures.length > 0 && nextFeatures === currentFeatures) {
    return currentFeatures;
  }

  // Interpolate between timestamps
  const ratio = timestamp - ts;
  const interpolated = [];

  // Create map of next features by flight ID
  const nextMap = new Map();
  nextFeatures.forEach((f) => {
    const id = f.properties.callsign || f.properties.icao24;
    nextMap.set(id, f);
  });

  // Interpolate current features
  currentFeatures.forEach((current) => {
    const id = current.properties.callsign || current.properties.icao24;
    const next = nextMap.get(id);

    if (next && ratio > 0 && ratio < 1) {
      // Interpolate position
      const currentCoords = current.geometry.coordinates;
      const nextCoords = next.geometry.coordinates;

      interpolated.push({
        ...current,
        geometry: {
          type: "Point",
          coordinates: [
            currentCoords[0] + (nextCoords[0] - currentCoords[0]) * ratio,
            currentCoords[1] + (nextCoords[1] - currentCoords[1]) * ratio,
          ],
        },
        properties: {
          ...current.properties,
          timestamp: timestamp,
        },
      });
    } else {
      // No interpolation needed or no next position
      interpolated.push(current);
    }
  });

  return interpolated;
}

// Update display - called every frame for smooth animation
function updateDisplay() {
  if (!map.getSource("current-flights")) return;

  // Get interpolated features from cache
  const features = getInterpolatedFeatures(currentTimestamp);

  // Update map immediately (smooth, no waiting for API)
  map.getSource("current-flights").setData({
    type: "FeatureCollection",
    features: features,
  });

  // Update cache in background (non-blocking)
  if (Math.abs(currentTimestamp - lastCacheUpdate) >= cacheUpdateInterval) {
    updateCache();
  }

  // Update trails periodically
  if (
    Math.floor(currentTimestamp) % 300 === 0 ||
    !updateDisplay.lastTrailUpdate ||
    Math.floor(currentTimestamp) - updateDisplay.lastTrailUpdate >= 300
  ) {
    fetch(
      `${API_BASE}/trails?timestamp=${Math.floor(
        currentTimestamp
      )}&trail_minutes=${trailMinutes}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.features) {
          map.getSource("trails").setData({
            type: "FeatureCollection",
            features: data.features,
          });
        }
      })
      .catch((e) => console.error("Error fetching trails:", e));

    updateDisplay.lastTrailUpdate = Math.floor(currentTimestamp);
  }

  // Update UI (throttled)
  if (!updateDisplay.lastUIUpdate || Math.floor(currentTimestamp) % 60 === 0) {
    const currentTime = new Date(currentTimestamp * 1000);
    document.getElementById("timeDisplay").textContent =
      currentTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    document.getElementById("cellInfo").innerHTML = `
      <strong>Timelapse (${playbackSpeed}x)</strong><br>
      Active Flights: ${features.length}<br>
      Time: ${currentTime.toLocaleTimeString()}<br>
      Trails: Last ${trailMinutes} min
    `;

    const progress =
      ((currentTimestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * 100;
    document.getElementById("timeSlider").value = Math.min(
      100,
      Math.max(0, progress)
    );

    updateDisplay.lastUIUpdate = Math.floor(currentTimestamp);
  }
}

// Animation loop - continuously updates timestamp every frame
function animate(currentTime) {
  if (!isPlaying) return;

  if (!startTime) {
    startTime = currentTime;
    startTimestamp = currentTimestamp;
  }

  const elapsed = (currentTime - startTime) / 1000; // seconds of real time
  const flightTimeDelta = elapsed * playbackSpeed; // seconds of flight time

  // Continuously increment timestamp (smooth, fractional seconds)
  currentTimestamp = startTimestamp + flightTimeDelta;

  // Loop back to start when we reach the end
  const duration = maxTimestamp - minTimestamp;
  if (currentTimestamp > maxTimestamp) {
    currentTimestamp =
      minTimestamp + ((currentTimestamp - maxTimestamp) % duration);
    startTimestamp = currentTimestamp;
    startTime = currentTime;
  }

  // Update display every frame for smooth movement
  updateDisplay();

  // Continue animation
  animationFrameId = requestAnimationFrame(animate);
}

// Event handlers
document.getElementById("timeSlider").addEventListener("input", (e) => {
  const progress = parseInt(e.target.value) / 100;
  currentTimestamp = minTimestamp + (maxTimestamp - minTimestamp) * progress;
  startTimestamp = currentTimestamp;
  if (isPlaying) {
    startTime = null; // Reset animation
  }
  updateCache().then(() => updateDisplay());
});

document.getElementById("playPause").addEventListener("click", () => {
  if (isPlaying) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isPlaying = false;
    startTime = null;
    document.getElementById("playPause").textContent = "▶ Play";
  } else {
    isPlaying = true;
    startTime = null; // Will reset in animate()
    startTimestamp = currentTimestamp;
    document.getElementById("playPause").textContent = "⏸ Pause";
    animationFrameId = requestAnimationFrame(animate);
  }
});

document.getElementById("resetTime").addEventListener("click", () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isPlaying = false;
  startTime = null;
  startTimestamp = minTimestamp;
  document.getElementById("playPause").textContent = "▶ Play";
  currentTimestamp = minTimestamp;
  lastCacheUpdate = 0;
  flightCache.clear();
  updateCache().then(() => updateDisplay());
});

// Initialize when page loads
initialize();
