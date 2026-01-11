import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { X, Plane, Fuel, Leaf, Clock, Route, Layers, Globe, Map as MapIcon, Satellite } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { calculateBounds, calculateCenter, offsetLngLat, calculateHeading, toDegrees } from '@/lib/geo';
import { pointsToCoordinates, getFormationSegment, REPLAY_STATES } from '@/lib/replay';
import { formatNumber, formatCO2, formatDistance } from '@/lib/utils';

// Route colors
const COLORS = {
  routeA: '#6366f1', // Indigo
  routeB: '#8b5cf6', // Purple
  formation: '#22c55e', // Green (neon for formation)
  formationGlow: '#4ade80',
  connector: '#f59e0b', // Amber
  joinSplit: '#ef4444', // Red
};

export default function MapScene({
  scenarios,
  selectedScenario,
  replayState,
  followCamera,
  onPopupClose,
  heatmapEnabled = false,
  heatmapData = null,
  heatmapTimeBucket = null,
  theme = 'light',
}) {
  const isDark = theme === 'dark';
  const mapContainer = useRef(null);
  const map = useRef(null);
  const popup = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(0);
  const [currentStyle, setCurrentStyle] = useState('satellite');
  const [showPopup, setShowPopup] = useState(false);
  const [popupData, setPopupData] = useState(null);
  const lastCameraUpdate = useRef(0);
  const shouldSpin = useRef(false); // Disabled auto-scroll/rotation
  const iconsLoaded = useRef({ leader: false, follower: false });

  // Styles configuration
  const STYLES = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    light: 'mapbox://styles/mapbox/light-v11',
  };

  const changeStyle = (styleKey) => {
    if (map.current) {
      map.current.setStyle(STYLES[styleKey]);
      setCurrentStyle(styleKey);
    }
  };

  // Check for Mapbox token
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // Initialize map
  useEffect(() => {
    if (!mapboxToken) return;
    if (map.current) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: STYLES.satellite,
      center: [-30, 45],
      zoom: 2,
      pitch: 45,
      bearing: 0,
      projection: 'globe',
      // Enable all interactions for interactive globe
      dragRotate: true,
      dragPan: true,
      scrollZoom: true,
      boxZoom: true,
      touchZoomRotate: true,
      touchPitch: true,
      doubleClickZoom: true,
      keyboard: true,
      maxPitch: 0,
      // Smoothness settings
      fadeDuration: 300,
      crossSourceCollisions: false,
    });

    // Configure smooth scroll zoom
    map.current.scrollZoom.setWheelZoomRate(1 / 50); // Faster zoom
    map.current.scrollZoom.setZoomRate(1 / 20);

    // Configure drag pan for smooth inertia
    map.current.dragPan.enable({
      linearity: 0.1,
      easing: (t) => t * (2 - t), // Ease-out quadratic
      maxSpeed: 2500, // Max speed 2500 px/s
      deceleration: 500, // Low deceleration = more "throw" glide
    });

    // Add scale control
    map.current.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Add navigation controls with compass and zoom
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      }),
      'top-right'
    );

    // Spin Animation Logic
    let userInteracting = false;
    let spinAnimation = null;

    const spinGlobe = () => {
      if (!shouldSpin.current || userInteracting || !map.current) {
        spinAnimation = null;
        return;
      }

      // Use easeTo for much smoother rotation
      const center = map.current.getCenter();
      map.current.easeTo({
        center: [center.lng - 0.5, center.lat],
        duration: 50,
        easing: (t) => t, // Linear for continuous motion
      });

      spinAnimation = setTimeout(spinGlobe, 50);
    };

    const interactStart = () => {
      userInteracting = true;
      if (spinAnimation) {
        clearTimeout(spinAnimation);
        spinAnimation = null;
      }
    };

    const interactEnd = (delay = 1000) => {
      userInteracting = false;
      if (shouldSpin.current && !spinAnimation) {
        spinAnimation = setTimeout(spinGlobe, delay);
      }
    };

    // Interaction Listeners
    map.current.on('mousedown', interactStart);
    map.current.on('touchstart', interactStart);
    map.current.on('wheel', () => {
      interactStart();
      if (spinAnimation) clearTimeout(spinAnimation);
      setTimeout(() => interactEnd(1000), 1000);
    });

    map.current.on('mouseup', () => interactEnd(1000));
    map.current.on('touchend', () => interactEnd(1000));
    map.current.on('dragend', () => interactEnd(3000));

    // Layer Setup Function (Runs on style load)
    const setupLayers = () => {
      if (!map.current) return;
      // Load plane icons
      const loadIcons = () => {
        iconsLoaded.current = { leader: false, follower: false };
        let loadCount = 0;
        const totalLoads = 2;

        const tryCreateLayers = () => {
          loadCount++;
          if (loadCount >= totalLoads) {
            createPlaneLayers();
          }
        };

        // Use simple paths (Vite serves /public at root)
        const leaderIconPath = '/icons/plane_leader.png';
        const followerIconPath = '/icons/plane_follower.png';

        const loadIcon = (path, iconName, isLeader) => {
          return new Promise((resolve) => {
            if (!map.current) {
              resolve(false);
              return;
            }

            map.current.loadImage(path, (error, img) => {
              if (error || !img || !map.current) {
                console.warn(`Failed to load ${iconName} icon from ${path}, using circle fallback`);
                if (error) console.warn('Error details:', error);
                resolve(false);
              } else {
                try {
                  // Remove existing image if present
                  if (map.current.hasImage(iconName)) {
                    map.current.removeImage(iconName);
                  }
                  map.current.addImage(iconName, img);
                  console.log(`✓ ${iconName} icon loaded successfully`);
                  if (isLeader) {
                    iconsLoaded.current.leader = true;
                  } else {
                    iconsLoaded.current.follower = true;
                  }
                  resolve(true);
                } catch (e) {
                  console.warn(`Failed to add ${iconName} image:`, e);
                  resolve(false);
                }
              }
            });
          });
        };

        // Small delay to ensure map is fully ready for image loading
        setTimeout(() => {
          if (!map.current) {
            createPlaneLayers();
            return;
          }

          // Load both icons
          Promise.all([
            loadIcon(leaderIconPath, 'planeLeader', true),
            loadIcon(followerIconPath, 'planeFollower', false)
          ]).then((results) => {
            console.log('Icon loading complete:', { leader: results[0], follower: results[1] });
            createPlaneLayers();
          }).catch((e) => {
            console.warn('Error in icon loading promise:', e);
            createPlaneLayers();
          });
        }, 100);  // Small delay to ensure map is ready
      };

      // Create plane layers (called after icon loading attempts)
      const createPlaneLayers = () => {
        if (!map.current) return;

        // Remove existing plane layers if they exist
        if (map.current.getLayer('leader-plane-layer')) {
          map.current.removeLayer('leader-plane-layer');
        }
        if (map.current.getLayer('follower-plane-layer')) {
          map.current.removeLayer('follower-plane-layer');
        }

        const useIcons = iconsLoaded.current.leader && iconsLoaded.current.follower;

        // Planes should render on top of connector lines, so add them after all route/line layers
        // No beforeLayerId means they'll be added at the end (on top)

        // Add FOLLOWER layer FIRST (so leader renders on top)
        if (useIcons) {
          // Symbol layer with icon
          const followerLayerDef = {
            id: 'follower-plane-layer',
            type: 'symbol',
            source: 'follower-plane',
            layout: {
              'icon-image': iconsLoaded.current.follower ? 'planeFollower' : 'planeLeader',
              'icon-size': 0.075,
              'icon-rotate': ['coalesce', ['get', 'bearing'], 0], // Default to 0 if bearing is null
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-offset': [10, 10], // Default offset for non-LOCKED phases
            },
            paint: {
              'icon-opacity': 0.65, // Default opacity
            },
          };
          // Add at end (no beforeLayerId) so planes render on top of connector lines
          map.current.addLayer(followerLayerDef);
        } else {
          // Fallback circle layer
          const followerLayerDef = {
            id: 'follower-plane-layer',
            type: 'circle',
            source: 'follower-plane',
            paint: {
              'circle-radius': 10,
              'circle-color': COLORS.routeB,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.65,
            },
          };
          // Add at end (no beforeLayerId) so planes render on top of connector lines
          map.current.addLayer(followerLayerDef);
        }

        // Add LEADER layer AFTER follower (so it renders on top)
        if (useIcons) {
          // Symbol layer with icon
          const leaderLayerDef = {
            id: 'leader-plane-layer',
            type: 'symbol',
            source: 'leader-plane',
            layout: {
              'icon-image': 'planeLeader',
              'icon-size': 0.08,
              'icon-rotate': ['coalesce', ['get', 'bearing'], 0], // Default to 0 if bearing is null
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          };
          map.current.addLayer(leaderLayerDef, 'follower-plane-layer');
        } else {
          // Fallback circle layer
          const leaderLayerDef = {
            id: 'leader-plane-layer',
            type: 'circle',
            source: 'leader-plane',
            paint: {
              'circle-radius': 10,
              'circle-color': COLORS.routeA,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#ffffff',
            },
          };
          map.current.addLayer(leaderLayerDef, 'follower-plane-layer');
        }
      };

      // Add terrain
      if (!map.current.getSource('mapbox-dem')) {
        try {
          map.current.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
          map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.25 });
        } catch (e) {
          console.warn('Terrain setup failed:', e);
        }
      }

      // Add sky layer
      if (!map.current.getLayer('sky')) {
        try {
          map.current.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 90.0],
              'sky-atmosphere-sun-intensity': 15,
            },
          });
        } catch (e) {
          console.warn('Sky layer setup failed:', e);
        }
      }

      // Set Fog
      try {
        map.current.setFog({
          'horizon-blend': 0, // No glow
          'space-color': '#eee', // Dark blue-black space
          'star-intensity': 0.2, // Subtle stars
        });
      } catch (e) { }

      // Define Sources
      const sources = [
        'route-a', 'route-b', 'formation-segment', 'connector-line',
        'leader-plane', 'follower-plane', 'join-split-markers', 'heatmap-source'
      ];

      sources.forEach(id => {
        if (!map.current.getSource(id)) {
          map.current.addSource(id, {
            type: 'geojson',
            data: id.includes('plane')
              ? { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { bearing: 0 } }
              : id === 'join-split-markers' || id === 'heatmap-source'
                ? { type: 'FeatureCollection', features: [] }
                : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
          });
        }
      });

      // Add Layers
      // Route A
      if (!map.current.getLayer('route-a-line')) {
        map.current.addLayer({
          id: 'route-a-line',
          type: 'line',
          source: 'route-a',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': COLORS.routeA, 'line-width': 3, 'line-opacity': 0.7 },
        });
      }

      // Route B
      if (!map.current.getLayer('route-b-line')) {
        map.current.addLayer({
          id: 'route-b-line',
          type: 'line',
          source: 'route-b',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': COLORS.routeB, 'line-width': 3, 'line-opacity': 0.7 },
        });
      }

      // Formation Segment
      if (!map.current.getLayer('formation-segment-glow')) {
        map.current.addLayer({
          id: 'formation-segment-glow',
          type: 'line',
          source: 'formation-segment',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': COLORS.formationGlow,
            'line-width': 12,
            'line-opacity': 0.3,
            'line-blur': 8,
          },
        });
      }

      if (!map.current.getLayer('formation-segment-line')) {
        map.current.addLayer({
          id: 'formation-segment-line',
          type: 'line',
          source: 'formation-segment',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': COLORS.formation, 'line-width': 4, 'line-opacity': 1 },
        });
      }

      // Connector
      if (!map.current.getLayer('connector-line-layer')) {
        map.current.addLayer({
          id: 'connector-line-layer',
          type: 'line',
          source: 'connector-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': COLORS.connector,
            'line-width': 2,
            'line-dasharray': [2, 4],
            'line-opacity': 0.8,
          },
        });
      }

      // Join/Split Markers
      if (!map.current.getLayer('join-split-markers-layer')) {
        map.current.addLayer({
          id: 'join-split-markers-layer',
          type: 'circle',
          source: 'join-split-markers',
          paint: {
            'circle-radius': 8,
            'circle-color': COLORS.joinSplit,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      // Heatmap Layer (added before planes so it renders behind them)
      if (!map.current.getLayer('heatmap-layer')) {
        map.current.addLayer({
          id: 'heatmap-layer',
          type: 'heatmap',
          source: 'heatmap-source',
          paint: {
            // Weight based on intensity property
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'intensity'],
              0, 0,
              1, 0.2,
              5, 0.5,
              10, 0.8,
              20, 1
            ],
            // Intensity based on zoom
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 1,
              4, 2,
              6, 3,
              8, 4
            ],
            // Color ramp: blue -> green -> yellow -> red
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(33, 150, 243, 0)',
              0.2, 'rgba(33, 150, 243, 0.4)',
              0.4, 'rgba(76, 175, 80, 0.6)',
              0.6, 'rgba(255, 235, 59, 0.8)',
              0.8, 'rgba(255, 152, 0, 0.9)',
              1, 'rgba(244, 67, 54, 1)'
            ],
            // Radius based on zoom
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 15,
              4, 25,
              6, 40,
              8, 60,
              10, 80
            ],
            // Opacity - visible at low zoom, fades at high zoom
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 0.8,
              6, 0.6,
              8, 0.4,
              10, 0.2
            ],
          },
        }, 'join-split-markers-layer'); // Add before join-split markers
      }

      // Planes will be created by createPlaneLayers() after icon loading
      // Load icons and create plane layers
      loadIcons();

      // Cursor Logic - will be set up after layers are created
      const setupCursorHandlers = () => {
        if (!map.current) return;
        const setPointer = () => map.current.getCanvas().style.cursor = 'pointer';
        const clearPointer = () => map.current.getCanvas().style.cursor = '';

        // Remove existing handlers
        map.current.off('mouseenter', 'leader-plane-layer', setPointer);
        map.current.off('mouseleave', 'leader-plane-layer', clearPointer);
        map.current.off('mouseenter', 'follower-plane-layer', setPointer);
        map.current.off('mouseleave', 'follower-plane-layer', clearPointer);

        // Add handlers
        if (map.current.getLayer('leader-plane-layer')) {
          map.current.on('mouseenter', 'leader-plane-layer', setPointer);
          map.current.on('mouseleave', 'leader-plane-layer', clearPointer);
        }
        if (map.current.getLayer('follower-plane-layer')) {
          map.current.on('mouseenter', 'follower-plane-layer', setPointer);
          map.current.on('mouseleave', 'follower-plane-layer', clearPointer);
        }
      };

      // Setup cursor handlers after a short delay to ensure layers exist
      setTimeout(setupCursorHandlers, 100);

      setMapLoaded(true);
    };

    map.current.on('style.load', () => {
      setupLayers();
      setStyleLoaded(s => s + 1);
      setTimeout(() => {
        if (shouldSpin.current && !userInteracting) spinGlobe();
      }, 500);
    });

    // Also wait for map load event to ensure icons can be loaded
    map.current.on('load', () => {
      // Icons will be loaded in setupLayers, but ensure it happens after full load
      if (!iconsLoaded.current.leader || !iconsLoaded.current.follower) {
        console.log('Map fully loaded, ensuring plane icons are loaded...');
      }
    });

    // Click handler for popup
    map.current.on('click', (e) => {
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['leader-plane-layer', 'follower-plane-layer'],
      });
      if (features.length > 0) setShowPopup(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken]);

  // Update routes when scenario changes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Sync spin state - disabled auto-scroll (always false)
    shouldSpin.current = false;

    if (!selectedScenario) {
      // Clear all sources
      map.current.getSource('route-a')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
      map.current.getSource('route-b')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
      map.current.getSource('formation-segment')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
      map.current.getSource('join-split-markers')?.setData({
        type: 'FeatureCollection',
        features: [],
      });
      // Clear plane positions but ensure they have bearing: 0 to avoid errors
      map.current.getSource('leader-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { bearing: 0 },
      });
      map.current.getSource('follower-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { bearing: 0 },
      });
      return;
    }

    // Update route A
    const routeACoords = pointsToCoordinates(selectedScenario.leader.points);
    map.current.getSource('route-a')?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routeACoords },
    });

    // Update route B
    const routeBCoords = pointsToCoordinates(selectedScenario.follower.points);
    map.current.getSource('route-b')?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routeBCoords },
    });

    // Update formation segment
    const formationCoords = getFormationSegment(selectedScenario);
    map.current.getSource('formation-segment')?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: formationCoords },
    });

    // Update join/split markers
    const joinPoint = selectedScenario.leader.points[selectedScenario.joinIndex];
    const splitPoint = selectedScenario.leader.points[selectedScenario.splitIndex];

    map.current.getSource('join-split-markers')?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [joinPoint.lon, joinPoint.lat] },
          properties: { type: 'join' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [splitPoint.lon, splitPoint.lat] },
          properties: { type: 'split' },
        },
      ],
    });

    // Fit bounds with smooth animation
    const allPoints = [...selectedScenario.leader.points, ...selectedScenario.follower.points];
    const bounds = calculateBounds(allPoints);

    map.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 150, left: 350, right: 50 },
      duration: 2000,
      pitch: 0,
      bearing: -20,
      essential: true,
      easing: (t) => 1 - Math.pow(1 - t, 3), // Ease-out cubic for smooth deceleration
    });

    // Update popup data
    setPopupData(selectedScenario);
  }, [selectedScenario, mapLoaded, styleLoaded]);

  // Update plane positions during replay
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // If no replay state, clear planes but keep bearing: 0
    if (!replayState) {
      map.current.getSource('leader-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { bearing: 0 },
      });
      map.current.getSource('follower-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { bearing: 0 },
      });
      map.current.getSource('connector-line')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
      return;
    }

    const { leaderPosition, followerPosition, showConnector, phase } = replayState;

    if (leaderPosition) {
      // Calculate bearing in degrees (0-360, clockwise from north)
      // heading is in radians from calculateHeading, convert to degrees
      const bearingDeg = leaderPosition.heading !== undefined 
        ? (toDegrees(leaderPosition.heading) + 360) % 360
        : 0;

      map.current.getSource('leader-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [leaderPosition.lon, leaderPosition.lat] },
        properties: {
          bearing: bearingDeg,
        },
      });
    }

    if (followerPosition) {
      // Calculate bearing in degrees
      const bearingDeg = followerPosition.heading !== undefined
        ? (toDegrees(followerPosition.heading) + 360) % 360
        : 0;

      map.current.getSource('follower-plane')?.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [followerPosition.lon, followerPosition.lat] },
        properties: {
          bearing: bearingDeg,
        },
      });
    }

    // Update phase-based styling for follower plane
    if (phase && map.current.getLayer('follower-plane-layer')) {
      try {
        const layerType = map.current.getLayer('follower-plane-layer').type;
        
        if (layerType === 'symbol') {
          // Symbol layer - adjust offset and opacity based on phase
          if (phase === REPLAY_STATES.LOCKED) {
            // In LOCKED phase, world-space offset already separates planes
            map.current.setLayoutProperty('follower-plane-layer', 'icon-offset', [0, 0]);
            map.current.setPaintProperty('follower-plane-layer', 'icon-opacity', 0.8);
          } else {
            // In RENDEZVOUS/SPLIT phases, use screen-space offset to avoid overlap
            map.current.setLayoutProperty('follower-plane-layer', 'icon-offset', [10, 10]);
            map.current.setPaintProperty('follower-plane-layer', 'icon-opacity', 0.65);
          }
        } else if (layerType === 'circle') {
          // Circle layer fallback - adjust opacity only
          if (phase === REPLAY_STATES.LOCKED) {
            map.current.setPaintProperty('follower-plane-layer', 'circle-opacity', 0.8);
          } else {
            map.current.setPaintProperty('follower-plane-layer', 'circle-opacity', 0.65);
          }
        }
      } catch (e) {
        console.warn('Error updating phase-based styling:', e);
      }
    }

    // Update connector line
    if (showConnector && leaderPosition && followerPosition) {
      map.current.getSource('connector-line')?.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [leaderPosition.lon, leaderPosition.lat],
            [followerPosition.lon, followerPosition.lat],
          ],
        },
      });
    } else {
      map.current.getSource('connector-line')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
    }

    // Camera follow (throttled) with smooth easing
    if (followCamera && leaderPosition) {
      const now = Date.now();
      if (now - lastCameraUpdate.current > 800) {
        lastCameraUpdate.current = now;
        map.current.easeTo({
          center: [leaderPosition.lon, leaderPosition.lat],
          duration: 1200,
          easing: (t) => 1 - Math.pow(1 - t, 2), // Ease-out quadratic
          essential: true,
        });
      }
    }
  }, [replayState, followCamera, mapLoaded, styleLoaded]);

  // Update heatmap data
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const heatmapSource = map.current.getSource('heatmap-source');
    if (!heatmapSource) return;

    if (heatmapEnabled && heatmapData) {
      // Data is already interpolated from HeatmapControls, no need to filter
      const filteredData = Array.isArray(heatmapData) ? heatmapData : [];

      // Convert to GeoJSON format
      const geoJsonData = {
        type: 'FeatureCollection',
        features: filteredData.map((cell) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [cell.lon, cell.lat],
          },
          properties: {
            intensity: cell.intensity || cell.flight_count || 0,
            flight_count: cell.flight_count || 0,
            node_count: cell.node_count || 0,
            time_bucket: cell.time_bucket,
          },
        })),
      };

      heatmapSource.setData(geoJsonData);
      
      // Show heatmap layer
      if (map.current.getLayer('heatmap-layer')) {
        map.current.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
      }
    } else {
      // Hide heatmap layer
      if (map.current.getLayer('heatmap-layer')) {
        map.current.setLayoutProperty('heatmap-layer', 'visibility', 'none');
      }
      // Clear data
      heatmapSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [heatmapEnabled, heatmapData, heatmapTimeBucket, mapLoaded, styleLoaded]);

  // No token UI
  if (!mapboxToken) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Mapbox Token Required</h2>
          <p className="text-gray-400 mb-4">
            Please set your Mapbox access token in the <code className="bg-gray-800 px-2 py-1 rounded">.env</code> file:
          </p>
          <code className="block bg-gray-800 p-3 rounded text-sm text-left">
            VITE_MAPBOX_TOKEN=your_token_here
          </code>
          <p className="text-gray-500 text-sm mt-4">
            Get a free token at{' '}
            <a href="https://mapbox.com" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
              mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Instructions overlay when no scenario selected */}
      {!selectedScenario && mapLoaded && (
        <div
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 backdrop-blur-sm px-6 py-3 rounded-full text-sm flex items-center gap-3 border ${
            isDark ? 'bg-slate-900/80 text-slate-100 border-white/10' : 'bg-white/90 text-slate-900 border-slate-200'
          }`}
        >
          <span className="animate-pulse">Click and drag to rotate the globe</span>
          <span className={isDark ? 'text-slate-400' : 'text-slate-400'}>|</span>
          <span>Scroll to zoom</span>
          <span className={isDark ? 'text-slate-400' : 'text-slate-400'}>|</span>
          <span>Select a flight from the sidebar</span>
        </div>
      )}



      {/* Style Switcher */}
      <div className="absolute top-4 left-4 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`backdrop-blur-md hover:bg-slate-100 ${
                isDark
                  ? 'bg-slate-900/80 border-white/10 text-slate-100 hover:bg-slate-800'
                  : 'bg-white/90 border-slate-200 text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4 mr-2" />
              <span className="capitalize font-mono text-xs">{currentStyle.replace('satellite', 'sat')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={`w-40 ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}
          >
            <DropdownMenuItem
              onClick={() => changeStyle('dark')}
              className={`cursor-pointer ${isDark ? 'hover:bg-slate-800 focus:bg-slate-800' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
            >
              <MapIcon className={`w-4 h-4 mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>Dark Mode</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeStyle('satellite')}
              className={`cursor-pointer ${isDark ? 'hover:bg-slate-800 focus:bg-slate-800' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
            >
              <Satellite className={`w-4 h-4 mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>Satellite</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeStyle('light')}
              className={`cursor-pointer ${isDark ? 'hover:bg-slate-800 focus:bg-slate-800' : 'hover:bg-slate-100 focus:bg-slate-100'}`}
            >
              <Globe className={`w-4 h-4 mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>Light Mode</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Route Legend - only show when scenario selected */}
      {selectedScenario && (
        <div
          className={`absolute top-4 right-16 backdrop-blur-md rounded-lg p-3 border text-xs ${
            isDark ? 'bg-slate-900/80 border-white/10 text-slate-100' : 'bg-white/90 border-slate-200 text-slate-900'
          }`}
        >
          <div className={`font-mono text-[10px] uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Legend</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded" style={{ backgroundColor: COLORS.routeA }} />
              <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>Leader Route</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded" style={{ backgroundColor: COLORS.routeB }} />
              <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>Follower Route</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded" style={{ backgroundColor: COLORS.formation }} />
              <span className={isDark ? 'text-emerald-400 font-medium' : 'text-emerald-700 font-medium'}>Formation Segment</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-1 rounded"
                style={{
                  backgroundColor: COLORS.connector,
                }}
              />
              <span className={isDark ? 'text-amber-400' : 'text-amber-700'}>Formation Link</span>
            </div>
          </div>
        </div>
      )}

      {/* Info Popup */}
      {showPopup && popupData && (
        <Card
          className={`absolute top-20 right-4 w-72 backdrop-blur-lg z-50 ${
            isDark ? 'bg-slate-900/90 border-white/10 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <div className="p-4">
            <div className={`flex items-center justify-between mb-3 border-b pb-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <span className={`font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <Plane className={`w-4 h-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} />
                Route Details
              </span>
              <Button
                variant="ghost"
                size="sm"
                className={`w-6 h-6 p-0 ${
                  isDark ? 'hover:bg-white/10 text-slate-300 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setShowPopup(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Leader */}
              <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: COLORS.routeA }} />
                <div>
                    <div className={`font-medium text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{popupData.leader.label}</div>
                    <div className="text-[10px] uppercase font-mono text-slate-500">
                    {popupData.leader.route} • {popupData.leader.airline}
                  </div>
                </div>
              </div>

              {/* Follower */}
              <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: COLORS.routeB }} />
                <div>
                    <div className={`font-medium text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{popupData.follower.label}</div>
                    <div className="text-[10px] uppercase font-mono text-slate-500">
                    {popupData.follower.route} • {popupData.follower.airline}
                  </div>
                </div>
              </div>

              <div className={`h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{popupData.metrics.formationMinutes} min</span>
                </div>
                <div className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <Route className="w-3.5 h-3.5 opacity-70" />
                  <span className={`font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatDistance(popupData.metrics.formationDistanceKm)}</span>
                </div>
                <div className={`flex items-center gap-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  <Leaf className="w-3.5 h-3.5" />
                  <span className="font-mono font-medium">{formatCO2(popupData.metrics.co2SavedKg)}</span>
                </div>
                <div className={`flex items-center gap-2 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <Fuel className="w-3.5 h-3.5" />
                  <span className="font-mono font-medium">{formatNumber(popupData.metrics.fuelSavedKg)} kg</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-600 font-mono mt-2 text-right">
                DATA DATE: {popupData.leader.date}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
