import React, { useEffect, useMemo, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const isGoogleMapsEnabled = Boolean(GOOGLE_MAPS_API_KEY);

const seedStations = [
  { id: 1, name: "Express Emission Test", address: "1246 Buford Hwy Cumming GA 30041", zip: "30041", city: "Cumming", price: 20, cashPrice: 20, cardPrice: 22, rating: 3.7, updatedAt: "2 days ago", verified: true, phone: "6789475514" },
  { id: 2, name: "Quick Emissions Suwanee", address: "Suwanee GA 30024", zip: "30024", city: "Suwanee", price: 18, cashPrice: 18, cardPrice: 20, rating: 4.4, updatedAt: "Today", verified: false, phone: "" },
  { id: 3, name: "Buford Emission Center", address: "Buford GA 30518", zip: "30518", city: "Buford", price: 16, cashPrice: 16, cardPrice: 18, rating: 4.3, updatedAt: "Recently", verified: false, phone: "" },
];

function calculateMiles(from, to) {
  if (!from || !to) return null;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMiles * c).toFixed(1));
}

async function geocodeAddress(address) {
  if (!isGoogleMapsEnabled || !address) return null;
  const maps = await loadGoogleMapsScript(GOOGLE_MAPS_API_KEY);
  const geocoder = new maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const location = results[0].geometry.location;
        resolve({ lat: location.lat(), lng: location.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

function mapSupabaseStationToUi(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    zip: row.zip || "",
    city: row.city || "",
    price: Number(row.price || 0),
    cashPrice: Number(row.cash_price || row.price || 0),
    cardPrice: Number(row.card_price || row.price || 0),
    rating: Number(row.rating || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "Recently",
    verified: Boolean(row.verified),
    phone: row.phone || "",
  };
}

async function fetchStationsFromSupabase() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/stations?select=*&order=price.asc`, {
    headers: supabaseHeaders,
  });
  if (!response.ok) throw new Error("Failed to fetch stations from Supabase");
  const rows = await response.json();
  return rows.map(mapSupabaseStationToUi);
}

async function insertPriceReportToSupabase(report) {
  const payload = {
    station_id: report.stationId,
    reported_cash_price: report.reportedCashPrice,
    reported_card_price: report.reportedCardPrice,
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/price_reports`, {
    method: "POST",
    headers: supabaseHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error("Failed to insert price report into Supabase");
  const rows = await response.json();
  return rows[0];
}

async function fetchMatchingPriceReports(stationId, reportedCashPrice, reportedCardPrice) {
  const cashFilter = reportedCashPrice === null || reportedCashPrice === undefined ? "reported_cash_price=is.null" : `reported_cash_price=eq.${reportedCashPrice}`;
  const cardFilter = reportedCardPrice === null || reportedCardPrice === undefined ? "reported_card_price=is.null" : `reported_card_price=eq.${reportedCardPrice}`;

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/price_reports?select=*&station_id=eq.${stationId}&${cashFilter}&${cardFilter}`,
    { headers: supabaseHeaders }
  );

  if (!response.ok) throw new Error("Failed to fetch matching price reports");
  return response.json();
}

async function updateStationPriceInSupabase(stationId, currentStation, newCashPrice, newCardPrice) {
  const finalCashPrice = newCashPrice ?? currentStation.cashPrice;
  const finalCardPrice = newCardPrice ?? currentStation.cardPrice;
  const finalMainPrice = Math.min(finalCashPrice || 9999, finalCardPrice || 9999);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/stations?id=eq.${stationId}`, {
    method: "PATCH",
    headers: supabaseHeaders,
    body: JSON.stringify({
      price: finalMainPrice,
      cash_price: finalCashPrice,
      card_price: finalCardPrice,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) throw new Error("Failed to update station price");
  const rows = await response.json();
  return mapSupabaseStationToUi(rows[0]);
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }
    const existingScript = document.getElementById("google-maps-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps));
      existingScript.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function StationCard({ station, onReport, isCheapest }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{station.name}</h3>
            {isCheapest && <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">🔥 Cheapest</span>}
            {station.verified && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">✓ Verified</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{station.address}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 px-3 py-2 text-center text-white">
          <div className="text-xs opacity-80">from</div>
          <div className="text-xl font-bold">${station.price}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="text-slate-600">💵 Cash ${station.cashPrice}</div>
        <div className="text-slate-600">💳 Card ${station.cardPrice}</div>
        <div className="text-slate-600">⭐ {station.rating}</div>
        <div className="text-slate-600">🕒 {station.updatedAt}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(station.address)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Get Directions
        </a>
        <button onClick={onReport} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Report Update
        </button>
      </div>
    </div>
  );
}

function GoogleMapView({ stations }) {
  const mapRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const [mapStatus, setMapStatus] = useState(isGoogleMapsEnabled ? "Loading map..." : "Add Google Maps API key to enable the map.");

  useEffect(() => {
    if (!isGoogleMapsEnabled || !mapRef.current) return;
    let cancelled = false;

    async function drawMap() {
      try {
        const maps = await loadGoogleMapsScript(GOOGLE_MAPS_API_KEY);
        if (cancelled || !mapRef.current) return;

        const map = new maps.Map(mapRef.current, {
          center: { lat: 34.0515, lng: -84.0713 },
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        const geocoder = new maps.Geocoder();
        const bounds = new maps.LatLngBounds();
        let markerCount = 0;

        for (const station of stations.slice(0, 10)) {
          if (!station.address || station.address === "Address pending verification") continue;
          await new Promise((resolve) => {
            geocoder.geocode({ address: station.address }, (results, status) => {
              if (status === "OK" && results?.[0]) {
                const position = results[0].geometry.location;
                const marker = new maps.Marker({
                  map,
                  position,
                  label: { text: `$${station.price}`, color: "white", fontWeight: "bold" },
                  title: station.name,
                });
                const infoWindow = new maps.InfoWindow({
                  content: `<div style="font-family:Arial,sans-serif;max-width:220px"><strong>${station.name}</strong><br/>${station.address}<br/><strong>Price: $${station.price}</strong></div>`,
                });
                marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
                markersRef.current.push(marker);
                bounds.extend(position);
                markerCount += 1;
              }
              resolve();
            });
          });
        }

        if (markerCount > 0) {
          map.fitBounds(bounds);
          setMapStatus("");
        } else {
          setMapStatus("No valid addresses to show on the map.");
        }
      } catch (error) {
        console.error(error);
        setMapStatus("Google Maps failed to load. Check your API key and billing settings.");
      }
    }

    drawMap();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [stations]);

  if (!isGoogleMapsEnabled) {
    return <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center text-slate-500">Add your Google Maps API key to enable the live map.</div>;
  }

  return (
    <div className="relative h-full">
      <div ref={mapRef} className="h-full w-full" />
      {mapStatus && <div className="absolute left-4 top-4 rounded-xl bg-white px-4 py-2 text-sm text-slate-600 shadow">{mapStatus}</div>}
    </div>
  );
}

function getZipFromPath() {
  const pathZip = window.location.pathname.replace("/", "").trim();
  return /^[0-9]{5}$/.test(pathZip) ? pathZip : "30024";
}

export default function App() {
  const [zip, setZip] = useState(getZipFromPath());
  const [sortBy, setSortBy] = useState("price");
  const [showReport, setShowReport] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [stations, setStations] = useState(seedStations);
  const [form, setForm] = useState({ cashPrice: "", cardPrice: "" });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState(isSupabaseEnabled ? "Supabase" : "Demo data");

  useEffect(() => {
    document.title = `Cheapest emission test near ${zip} | EmissionPrice`;
    const description = `Compare emission test prices near ${zip}. Find cheap emissions testing stations, cash prices, card prices, and directions.`;
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description);
  }, [zip]);

  useEffect(() => {
    async function loadStations() {
      if (isSupabaseEnabled) {
        try {
          setLoading(true);
          const supabaseStations = await fetchStationsFromSupabase();
          setStations(supabaseStations.length ? supabaseStations : seedStations);
          setDataSource("Supabase");
        } catch (error) {
          console.error(error);
          setDataSource("Demo data - Supabase error");
          setStations(seedStations);
        } finally {
          setLoading(false);
        }
        return;
      }

      const savedStations = window.localStorage.getItem("emission-price-stations");
      if (savedStations) {
        try {
          setStations(JSON.parse(savedStations));
        } catch (error) {
          console.error("Failed to load saved stations", error);
        }
      }
    }
    loadStations();
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled) {
      window.localStorage.setItem("emission-price-stations", JSON.stringify(stations));
    }
  }, [stations]);


  const filtered = useMemo(() => {
    const searchText = zip.trim().toLowerCase();
    const list = stations.filter((station) => {
      if (!searchText) return true;
      if (searchText === "30024") return true;
      return station.zip.toLowerCase().includes(searchText) || station.city.toLowerCase().includes(searchText) || station.name.toLowerCase().includes(searchText);
    });
    return [...list].sort((a, b) => {
      if (sortBy === "updated") return a.id - b.id;
      return a.price - b.price;
    });
  }, [zip, sortBy, stations]);

  const cheapest = filtered[0];

  const openReportModal = (station) => {
    setSelectedStation(station);
    setForm({ cashPrice: "", cardPrice: "" });
    setFormError("");
    setShowReport(true);
  };

  const submitReport = async (e) => {
    e.preventDefault();
    setFormError("");

    const cashPriceNumber = form.cashPrice ? Number(form.cashPrice) : null;
    const cardPriceNumber = form.cardPrice ? Number(form.cardPrice) : null;

    if (!selectedStation) {
      setFormError("Please select a station first.");
      return;
    }

    if (!form.cashPrice && !form.cardPrice) {
      setFormError("Please enter cash price, card price, or both.");
      return;
    }

    if (
      (form.cashPrice && (Number.isNaN(cashPriceNumber) || cashPriceNumber < 1 || cashPriceNumber > 50)) ||
      (form.cardPrice && (Number.isNaN(cardPriceNumber) || cardPriceNumber < 1 || cardPriceNumber > 50))
    ) {
      setFormError("Please enter valid prices between $1 and $50.");
      return;
    }

    try {
      setLoading(true);

      if (isSupabaseEnabled) {
        await insertPriceReportToSupabase({
          stationId: selectedStation.id,
          reportedCashPrice: cashPriceNumber,
          reportedCardPrice: cardPriceNumber,
        });

        const matchingReports = await fetchMatchingPriceReports(selectedStation.id, cashPriceNumber, cardPriceNumber);

        if (matchingReports.length >= 2) {
          const updatedStation = await updateStationPriceInSupabase(selectedStation.id, selectedStation, cashPriceNumber, cardPriceNumber);
          setStations((currentStations) =>
            currentStations.map((station) =>
              station.id === selectedStation.id ? updatedStation : station
            )
          );
          setFormError("");
          setShowReport(false);
          setSelectedStation(null);
          return;
        }
      }

      setFormError("Thanks! We received your report and will update the price after confirmation.");
      setForm({ cashPrice: "", cardPrice: "" });
    } catch (error) {
      console.error(error);
      setFormError("Could not save this report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-slate-900 p-2 text-white">🚗</div>
            <div>
              <div className="font-bold">EmissionPrice</div>
              <div className="text-xs text-slate-500">Find cheap emissions testing · {dataSource}</div>
            </div>
          </div>
          <button
            onClick={() => document.getElementById("station-results")?.scrollIntoView({ behavior: "smooth" })}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Report a station price
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm md:p-10">
            <div className="mb-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">Emission prices near {zip}</div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Find the cheapest emission test near {zip}.</h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">Compare local emission test prices by ZIP code. See cash price, card price, rating, and last updated time.</p>
            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row">
              <div className="relative flex-1">
                <span className="absolute left-3 top-3 text-slate-400">🔎</span>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Enter ZIP code, e.g. 30024" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <button
                onClick={() => {
                  const cleanZip = zip.trim();
                  if (/^[0-9]{5}$/.test(cleanZip)) {
                    window.history.pushState({}, "", `/${cleanZip}`);
                    document.title = `Cheapest emission test near ${cleanZip} | EmissionPrice`;
                  }
                }}
                className="rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-700"
              >
                Search
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm md:p-8">
            <div className="text-sm text-slate-300">Cheapest result</div>
            {cheapest ? (
              <>
                <div className="mt-5 text-6xl font-bold">${cheapest.price}</div>
                <div className="mt-3 text-xl font-semibold">{cheapest.name}</div>
                <div className="mt-2 text-slate-300">Updated {cheapest.updatedAt}</div>
                <button className="mt-6 rounded-xl bg-white px-5 py-3 font-semibold text-slate-900 hover:bg-slate-100">View Details</button>
              </>
            ) : (
              <p className="mt-4 text-slate-300">No stations found.</p>
            )}
          </div>
        </section>

        <section id="station-results" className="mt-8 grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Nearby stations</h2>
{loading && <p className="text-sm text-slate-500">Loading latest prices...</p>}
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="price">Sort by price</option>
                <option value="updated">Sort by updated</option>
              </select>
            </div>
            <div className="space-y-4">
              {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">No stations found. Try another ZIP or report a new price.</div>}
              {filtered.map((station) => <StationCard key={station.id} station={station} isCheapest={cheapest && station.id === cheapest.id} onReport={() => openReportModal(station)} />)}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:h-[720px]">
            <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-slate-100">
              <div className="border-b border-slate-200 bg-white p-4">
                <h2 className="font-bold">Map View</h2>
                <p className="text-sm text-slate-500">Live Google Maps markers show station prices.</p>
              </div>
              <div className="relative flex-1"><GoogleMapView stations={filtered} /></div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Crowdsourced prices", "Users can report the latest cash/card price."],
            ["Photo verification", "Later version can verify price signs with photos."],
            ["Local SEO pages", "Create ZIP pages like cheapest emission test near 30024."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-slate-600">{desc}</p></div>
          ))}
        </section>
      </main>

      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={submitReport} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Report a price</h2>
                {selectedStation && <p className="mt-1 text-sm text-slate-500">{selectedStation.name}</p>}
              </div>
              <button type="button" onClick={() => { setShowReport(false); setSelectedStation(null); }} className="rounded-full p-2 hover:bg-slate-100">×</button>
            </div>
            <div className="mt-5 space-y-4">
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input value={form.cashPrice} onChange={(e) => setForm({ ...form, cashPrice: e.target.value })} placeholder="Cash price, e.g. 18" type="number" min="1" max="50" step="0.01" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-900" />
                <input value={form.cardPrice} onChange={(e) => setForm({ ...form, cardPrice: e.target.value })} placeholder="Card price, e.g. 20" type="number" min="1" max="50" step="0.01" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <p className="text-sm text-slate-500">Submit the latest cash price, card price, or both. We will update the station price after confirmation.</p>
              {formError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
              <button disabled={loading} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{loading ? "Submitting..." : "Submit Price"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
