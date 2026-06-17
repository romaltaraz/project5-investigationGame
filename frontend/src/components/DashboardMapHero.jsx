import { useState, useEffect } from 'react';
import { Map, MapMarker, MarkerContent, MapControls } from './ui/mapcn-map-controls';
import '../styles/components/map-hero.css';

// Crime scene locations across the Middle East / Mediterranean
const CASE_LOCATIONS = [
  { id: 1, lng: 34.7818,  lat: 32.0853,  label: 'תל אביב',     status: 'active',  caseId: '#A-041' },
  { id: 2, lng: 35.2137,  lat: 31.7683,  label: 'ירושלים',     status: 'active',  caseId: '#B-019' },
  { id: 3, lng: 34.9896,  lat: 29.5581,  label: 'אילת',         status: 'closed',  caseId: '#C-007' },
  { id: 4, lng: 34.8516,  lat: 32.4994,  label: 'חיפה',         status: 'active',  caseId: '#D-055' },
  { id: 5, lng: 35.5018,  lat: 33.8886,  label: 'ביירות',       status: 'watch',   caseId: '#E-012' },
  { id: 6, lng: 36.2765,  lat: 33.5138,  label: 'דמשק',         status: 'watch',   caseId: '#F-034' },
  { id: 7, lng: 31.2357,  lat: 30.0444,  label: 'קהיר',         status: 'closed',  caseId: '#G-003' },
];

const STATUS_COLOR = {
  active: '#e0bb73',
  closed: '#5cb85c',
  watch:  '#ab4538',
};

const STATUS_LABEL = {
  active: 'בחקירה',
  closed: 'נסגר',
  watch:  'מעקב',
};

// Scanline & grain done via CSS; this component handles map + markers only
function CaseMarker({ location, isSelected, onClick }) {
  const color = STATUS_COLOR[location.status];

  return (
    <MapMarker longitude={location.lng} latitude={location.lat}>
      <MarkerContent>
        <div
          className={`map-marker ${isSelected ? 'map-marker--selected' : ''}`}
          style={{ '--marker-color': color }}
          onClick={onClick}
          title={location.label}
        >
          <span className="map-marker__ring" />
          <span className="map-marker__dot" />
        </div>
      </MarkerContent>
    </MapMarker>
  );
}

function InfoTooltip({ location }) {
  if (!location) return null;
  const color = STATUS_COLOR[location.status];
  return (
    <div className="map-tooltip">
      <div className="map-tooltip__id">{location.caseId}</div>
      <div className="map-tooltip__name">{location.label}</div>
      <div className="map-tooltip__status" style={{ color }}>
        {STATUS_LABEL[location.status]}
      </div>
    </div>
  );
}

export default function DashboardMapHero({ activeCases, solvedCases, openSlots }) {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [tick, setTick] = useState(0);
  const [blinkIdx, setBlinkIdx] = useState(0);

  // Rolling blink across active markers
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setBlinkIdx((i) => (i + 1) % CASE_LOCATIONS.filter(l => l.status === 'active').length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Dismiss tooltip on outside click
  const handleMapClick = () => {
    if (selectedLocation) setSelectedLocation(null);
  };

  return (
    <div className="map-hero">
      {/* ── Scanlines overlay ── */}
      <div className="map-hero__scanlines" aria-hidden="true" />
      <div className="map-hero__vignette"  aria-hidden="true" />

      {/* ── Map ── */}
      <div className="map-hero__map" onClick={handleMapClick}>
        <Map
          center={[34.8, 32.1]}
          zoom={5.8}
          theme="dark"
          pitch={0}
          bearing={0}
          scrollZoom={false}
          doubleClickZoom={false}
          touchZoomRotate={false}
          dragPan={false}
          dragRotate={false}
        >
          <MapControls position="bottom-right" showZoom showCompass />

          {CASE_LOCATIONS.map((loc) => (
            <CaseMarker
              key={loc.id}
              location={loc}
              isSelected={selectedLocation?.id === loc.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLocation(selectedLocation?.id === loc.id ? null : loc);
              }}
            />
          ))}
        </Map>
      </div>

      {/* ── Operations overlay ── */}
      <div className="map-hero__overlay">

        {/* Header */}
        <div className="map-hero__header">
          <div className="map-hero__classified">CLASSIFIED</div>
          <div className="map-hero__unit">
            <span className="map-hero__unit-code">S.I.U</span>
            <span className="map-hero__unit-sep">—</span>
            <span className="map-hero__unit-label">חדר מבצעים</span>
          </div>
          <div className="map-hero__live">
            <span className="map-hero__live-dot" />
            LIVE
          </div>
        </div>

        {/* Stats row */}
        <div className="map-hero__stats">
          <div className="map-hero__stat">
            <strong>{activeCases ?? 0}<span className="map-hero__stat-max">/3</span></strong>
            <span>תיקים פעילים</span>
          </div>
          <div className="map-hero__stat-divider" />
          <div className="map-hero__stat">
            <strong>{solvedCases ?? 0}</strong>
            <span>תיקים נפתרו</span>
          </div>
          <div className="map-hero__stat-divider" />
          <div className="map-hero__stat">
            <strong style={{ color: openSlots === 0 ? '#ab4538' : '#5cb85c' }}>{openSlots ?? 0}</strong>
            <span>מקומות פנויים</span>
          </div>
        </div>

        {/* Location legend */}
        <div className="map-hero__legend">
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <div key={status} className="map-hero__legend-item">
              <span className="map-hero__legend-dot" style={{ background: color }} />
              <span>{STATUS_LABEL[status]}</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── Selected location tooltip ── */}
      {selectedLocation && (
        <div className="map-hero__tooltip-wrap">
          <InfoTooltip location={selectedLocation} />
        </div>
      )}

      {/* ── Hint ── */}
      <p className="map-hero__hint">לחץ על סמן לפרטים</p>
    </div>
  );
}
