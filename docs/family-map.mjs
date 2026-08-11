import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
} from "./maplibre-gl.mjs";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dataUrlFor(root) {
  const configured = root.dataset.familyMapSource;
  if (configured) return new URL(configured, import.meta.url);
  return new URL("./family-tree.json", import.meta.url);
}

function assertDocument(documentData) {
  const mapData = documentData?.migration?.map;
  if (
    documentData?.schemaVersion !== 2 ||
    !mapData ||
    mapData.coordinateSystem !== "WGS84" ||
    !Array.isArray(mapData.places) ||
    !Array.isArray(mapData.views) ||
    !Array.isArray(mapData.routes)
  ) {
    throw new Error("Unsupported family migration map data");
  }
  const styleUrl = new URL(mapData.styleUrl);
  if (styleUrl.protocol !== "https:") throw new Error("Map style must use HTTPS");

  const placeIds = new Set();
  const locatedPlaceIds = new Set();
  mapData.places.forEach((place) => {
    if (!place?.id || !place.name || placeIds.has(place.id)) {
      throw new Error("Invalid family map place");
    }
    placeIds.add(place.id);
    if (place.locationStatus === "located" || place.locationStatus === "regional-anchor") {
      const validCoordinates =
        Array.isArray(place.coordinates) &&
        place.coordinates.length === 2 &&
        place.coordinates.every(Number.isFinite);
      if (!validCoordinates) throw new Error(`Invalid coordinates for ${place.id}`);
      locatedPlaceIds.add(place.id);
    } else if (place.locationStatus !== "unlocated" || place.coordinates !== undefined) {
      throw new Error(`Invalid location status for ${place.id}`);
    }
  });

  mapData.views.forEach((view) => {
    if (
      !view?.id ||
      !view.label ||
      !Number.isFinite(view.maxZoom) ||
      !Array.isArray(view.placeIds) ||
      view.placeIds.length === 0 ||
      !view.placeIds.every((placeId) => locatedPlaceIds.has(placeId))
    ) {
      throw new Error("Invalid family map view");
    }
  });
  mapData.routes.forEach((route) => {
    if (
      !route?.id ||
      !Array.isArray(route.placeIds) ||
      route.placeIds.length < 2 ||
      !route.placeIds.every((placeId) => locatedPlaceIds.has(placeId))
    ) {
      throw new Error("Invalid family map route");
    }
  });
  return mapData;
}

function indexStories(documentData) {
  const peopleById = new Map(documentData.people.map((person) => [person.id, person]));
  const storiesByPlaceId = new Map();
  for (const route of documentData.migration.routes) {
    for (const stop of route.stops) {
      for (const placeId of stop.placeIds ?? []) {
        const stories = storiesByPlaceId.get(placeId) ?? [];
        stories.push({
          id: stop.id,
          period: stop.period,
          summary: stop.summary,
          people: (stop.personIds ?? [])
            .map((personId) => peopleById.get(personId)?.name)
            .filter(Boolean),
        });
        storiesByPlaceId.set(placeId, stories);
      }
    }
  }
  return storiesByPlaceId;
}

function popupContent(place, stories) {
  const content = element("article", "family-map-popup");
  content.append(
    element(
      "p",
      "family-map-popup-status",
      place.locationStatus === "located" ? "具体地点" : "区域锚点",
    ),
    element("h3", "family-map-popup-title", place.name),
  );

  stories.forEach((story) => {
    const storyNode = element("section", "family-map-popup-story");
    storyNode.append(
      element("p", "family-map-popup-period", story.period),
      element("p", "family-map-popup-summary", story.summary),
    );
    if (story.people.length) {
      storyNode.append(
        element("p", "family-map-popup-people", `相关人物：${story.people.join("、")}`),
      );
    }
    content.append(storyNode);
  });

  content.append(element("p", "family-map-popup-note", place.coordinateNote));
  return content;
}

function markerElement(place) {
  const marker = element(
    "button",
    `family-map-marker family-map-marker-${place.locationStatus}`,
  );
  marker.type = "button";
  marker.setAttribute("aria-label", `查看${place.name}的家族迁徙记录`);
  marker.dataset.familyMapMarker = place.id;
  marker.append(
    element("span", "family-map-marker-dot"),
    element("span", "family-map-marker-label", place.name),
  );
  return marker;
}

function mapPadding(canvas) {
  return canvas.clientWidth < 700
    ? { top: 66, right: 28, bottom: 42, left: 28 }
    : { top: 76, right: 48, bottom: 56, left: 48 };
}

function boundsForPlaces(places) {
  const bounds = new LngLatBounds();
  places.forEach((place) => bounds.extend(place.coordinates));
  return bounds;
}

function routeGeoJson(mapData, placesById) {
  return {
    type: "FeatureCollection",
    features: mapData.routes.map((route) => ({
      type: "Feature",
      properties: { id: route.id, label: route.label },
      geometry: {
        type: "LineString",
        coordinates: route.placeIds.map((placeId) => placesById.get(placeId).coordinates),
      },
    })),
  };
}

async function enhanceFamilyMap(root) {
  if (root.dataset.familyMapInitialized === "true") return;
  root.dataset.familyMapInitialized = "true";
  root.dataset.familyMapState = "loading";

  const canvas = root.querySelector("[data-family-map-canvas]");
  const status = root.querySelector("[data-family-map-status]");
  const announcement = root.querySelector("[data-family-map-announcement]");
  const block = root.closest(".migration-map-block");
  if (!(canvas instanceof HTMLElement) || !(status instanceof HTMLElement)) return;

  try {
    const response = await fetch(dataUrlFor(root), { cache: "no-store" });
    if (!response.ok) throw new Error(`Family data returned ${response.status}`);
    const documentData = await response.json();
    const mapData = assertDocument(documentData);
    const storiesByPlaceId = indexStories(documentData);
    const placesById = new Map(mapData.places.map((place) => [place.id, place]));
    const mappedPlaces = mapData.places.filter(
      (place) => place.locationStatus === "located" || place.locationStatus === "regional-anchor",
    );
    const viewsById = new Map(mapData.views.map((view) => [view.id, view]));

    const map = new MapLibreMap({
      container: canvas,
      style: mapData.styleUrl,
      center: mappedPlaces[0].coordinates,
      zoom: 4.8,
      attributionControl: true,
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "按住Ctrl键并滚动可缩放地图",
        "CooperativeGesturesHandler.MacHelpText": "按住⌘键并滚动可缩放地图",
        "CooperativeGesturesHandler.MobileHelpText": "用两根手指移动地图",
      },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

    const markers = new Map();
    const popup = new Popup({
      closeButton: true,
      closeOnClick: true,
      focusAfterOpen: false,
      maxWidth: "340px",
      offset: 18,
    });
    let activeMarker = null;
    let ready = false;

    function setActivePlace(placeId, { move = true, focusMarker = false } = {}) {
      const place = placesById.get(placeId);
      const marker = markers.get(placeId);
      if (!place || !marker) return;

      activeMarker?.classList.remove("family-map-marker-active");
      marker.classList.add("family-map-marker-active");
      activeMarker = marker;
      popup
        .setLngLat(place.coordinates)
        .setDOMContent(popupContent(place, storiesByPlaceId.get(place.id) ?? []))
        .addTo(map);

      if (move) {
        map.easeTo({
          center: place.coordinates,
          zoom: Math.max(map.getZoom(), place.locationStatus === "located" ? 14.8 : 8.2),
          duration: reducedMotion.matches ? 0 : 420,
        });
      }
      if (focusMarker) {
        marker.focus({ preventScroll: true });
        const canvasBounds = canvas.getBoundingClientRect();
        const canvasIsVisible =
          canvasBounds.top >= 0 && canvasBounds.bottom <= window.innerHeight;
        if (!canvasIsVisible) {
          canvas.scrollIntoView({
            block: "center",
            behavior: reducedMotion.matches ? "auto" : "smooth",
          });
        }
      }
      if (announcement instanceof HTMLElement) {
        announcement.textContent = `已在地图中定位至${place.name}`;
      }
    }

    function showView(viewId, { announce = true } = {}) {
      const view = viewsById.get(viewId);
      if (!view) return;
      const places = view.placeIds.map((placeId) => placesById.get(placeId)).filter(Boolean);
      if (!places.length) return;
      map.fitBounds(boundsForPlaces(places), {
        padding: mapPadding(canvas),
        maxZoom: view.maxZoom,
        duration: reducedMotion.matches ? 0 : 420,
      });
      block?.querySelectorAll("[data-family-map-view]").forEach((button) => {
        if (button instanceof HTMLButtonElement) {
          button.setAttribute(
            "aria-pressed",
            button.dataset.familyMapView === viewId ? "true" : "false",
          );
        }
      });
      if (announce && announcement instanceof HTMLElement) {
        announcement.textContent = `地图已切换至${view.label}`;
      }
    }

    const loadTimeout = window.setTimeout(() => {
      if (ready) return;
      root.dataset.familyMapState = "error";
      status.textContent = "底图暂时无法加载。下方地点与故事仍可完整阅读。";
    }, 12000);

    map.once("load", () => {
      ready = true;
      window.clearTimeout(loadTimeout);
      root.dataset.familyMapState = "ready";
      if (block instanceof HTMLElement) block.dataset.familyMapReady = "true";
      status.textContent = "迁徙地图已加载";

      map.addSource("family-migration-routes", {
        type: "geojson",
        data: routeGeoJson(mapData, placesById),
      });
      map.addLayer({
        id: "family-migration-routes",
        type: "line",
        source: "family-migration-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#8f2028",
          "line-opacity": 0.58,
          "line-width": 1.6,
          "line-dasharray": [2, 1.5],
        },
      });

      mappedPlaces.forEach((place) => {
        const marker = markerElement(place);
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          setActivePlace(place.id);
        });
        new Marker({ element: marker, anchor: "left" }).setLngLat(place.coordinates).addTo(map);
        markers.set(place.id, marker);
      });

      showView(mapData.views[0].id, { announce: false });

      block?.querySelectorAll("[data-family-map-view]").forEach((button) => {
        const viewId = button.getAttribute("data-family-map-view");
        if (!(button instanceof HTMLButtonElement) || !viewId || !viewsById.has(viewId)) return;
        button.addEventListener("click", () => showView(viewId));
      });

      document.querySelectorAll("[data-migration-stop-id]").forEach((stop) => {
        if (!(stop instanceof HTMLElement)) return;
        const actionRoot = stop.querySelector("[data-family-map-actions]");
        if (!(actionRoot instanceof HTMLElement)) return;
        const ids = (stop.dataset.familyMapPlaceIds ?? "")
          .split(/\s+/)
          .filter((placeId) => markers.has(placeId));
        [...new Set(ids)].forEach((placeId) => {
          const place = placesById.get(placeId);
          if (!place) return;
          const button = element("button", "migration-map-focus", `在地图查看${place.name}`);
          button.type = "button";
          button.addEventListener("click", () => {
            setActivePlace(placeId, { move: true, focusMarker: true });
          });
          actionRoot.append(button);
        });
      });
    });

    popup.on("close", () => {
      activeMarker?.classList.remove("family-map-marker-active");
      activeMarker = null;
    });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => map.resize());
      observer.observe(canvas);
    }
  } catch (error) {
    root.dataset.familyMapState = "error";
    status.textContent = "底图暂时无法加载。下方地点与故事仍可完整阅读。";
    console.error("Family migration map failed to initialize", error);
  }
}

function initializeMaps() {
  document.querySelectorAll("[data-family-map]").forEach((root) => {
    if (root instanceof HTMLElement) void enhanceFamilyMap(root);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeMaps, { once: true });
} else {
  initializeMaps();
}
