import { useState, useMemo, useRef, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { MunicipalityRecord } from '../data/types';
import { buildRegionEntriesFromData, resolveRegionDensityByName } from '../lib/heatmapRegions';

// Russia regions GeoJSON (click_that_hood / JSDelivr CDN)
const RUSSIA_GEO_URL =
  'https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/russia.geojson';

// Dark burgundy → pale yellow
function densityColor(d: number | null): string {
  if (d === null) return '#f3f4f6';
  if (d >= 500)  return '#3d0000';
  if (d >= 200)  return '#6b0f0f';
  if (d >= 100)  return '#8b1a1a';
  if (d >= 60)   return '#a32828';
  if (d >= 40)   return '#c44040';
  if (d >= 25)   return '#d06020';
  if (d >= 15)   return '#e08040';
  if (d >= 8)    return '#ecab65';
  if (d >= 4)    return '#f5cc90';
  if (d >= 1.5)  return '#fae2b8';
  return '#fffde7';
}

function formatDensityValue(d: number | null): string {
  if (d === null) return 'нет данных';
  if (d < 1) return `${d.toFixed(2)} чел/км²`;
  if (d < 10) return `${d.toFixed(1)} чел/км²`;
  return `${Math.round(d)} чел/км²`;
}

const LEGEND_STEPS = [
  { label: '>500',    color: '#3d0000' },
  { label: '100–500', color: '#8b1a1a' },
  { label: '40–100',  color: '#c44040' },
  { label: '15–40',   color: '#e08040' },
  { label: '4–15',    color: '#f5cc90' },
  { label: '<4',      color: '#fffde7' },
];

interface HeatMapProps {
  data: MunicipalityRecord[];
}

export function HeatMap({ data }: HeatMapProps) {
  const [zoom, setZoom]   = useState(1);
  const [center, setCenter] = useState<[number, number]>([90, 62]);
  const [hovered, setHovered] = useState<{ name: string; density: number | null } | null>(null);
  const [tipPos, setTipPos]   = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const regionEntries = useMemo(() => buildRegionEntriesFromData(data), [data]);

  const resolvedDensity = useCallback(
    (featureName: string): number | null => {
      return resolveRegionDensityByName(featureName, regionEntries);
    },
    [regionEntries]
  );

  const handleMoveEnd = useCallback(
    ({ zoom: z, coordinates }: { zoom: number; coordinates: [number, number] }) => {
      setZoom(z);
      setCenter(coordinates);
    },
    []
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800">Карта плотности населения по регионам России</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Административные границы · тепловая шкала плотности (чел/км²) · зажмите и тяните для перемещения
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Плотность:</span>
          {LEGEND_STEPS.map((s) => (
            <div key={s.label} className="flex items-center gap-1">
              <span className="inline-block w-5 h-3 rounded-sm border border-black/10" style={{ background: s.color }} />
              <span className="text-[10px] text-gray-500 whitespace-nowrap">{s.label}</span>
            </div>
          ))}
          <span className="text-[10px] text-gray-400">чел/км²</span>
        </div>
      </div>

      {/* Map */}
      <div ref={containerRef} className="relative bg-white" style={{ height: 460 }}>
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          {[{ lbl: '+', d: 0.8 }, { lbl: '−', d: -0.8 }].map(({ lbl, d }) => (
            <button
              key={lbl}
              onClick={() => setZoom((z) => Math.min(10, Math.max(0.5, z + d)))}
              className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
              style={{ fontSize: 18, lineHeight: 1 }}
            >{lbl}</button>
          ))}
          <button
            onClick={() => { setZoom(1); setCenter([90, 62]); }}
            title="Сбросить"
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors text-sm"
          >⟳</button>
        </div>

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 310 }}
          width={960}
          height={460}
          style={{ width: '100%', height: '100%', background: '#ffffff' }}
        >
          <ZoomableGroup
            zoom={zoom}
            center={center}
            onMoveEnd={handleMoveEnd}
            minZoom={0.5}
            maxZoom={14}
          >
            <Geographies geography={RUSSIA_GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const name    = geo.properties?.name ?? geo.properties?.NAME ?? '';
                  const density = resolvedDensity(name);
                  const fill    = densityColor(density);
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth={0.6 / zoom}
                      style={{
                        default: { outline: 'none' },
                        hover:   { outline: 'none', fillOpacity: 0.78, cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={(e: React.MouseEvent) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                          setHovered({ name, density });
                        }
                      }}
                      onMouseMove={(e: React.MouseEvent) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Tooltip */}
        {hovered && (() => {
          const w = 190;
          const left = tipPos.x + 14 + w > (containerRef.current?.clientWidth ?? 9999)
            ? tipPos.x - w - 14
            : tipPos.x + 14;
          return (
            <div
              className="pointer-events-none absolute z-20 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3"
              style={{ left, top: Math.max(8, tipPos.y - 60), width: w }}
            >
              <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>{hovered.name || '—'}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-400">Плотность</span>
                <span className="font-semibold text-gray-700">
                  {formatDensityValue(hovered.density)}
                </span>
              </div>
              <div className="mt-1.5 w-full h-2 rounded-full overflow-hidden" style={{
                background: 'linear-gradient(to right, #fffde7, #f5cc90, #e08040, #c44040, #8b1a1a, #3d0000)'
              }}>
                <div
                  className="h-full w-1 rounded-full bg-white shadow-sm"
                  style={{
                    marginLeft: hovered.density === null
                      ? '0%'
                      : `${Math.min(98, Math.max(1, (Math.log10(Math.max(0.01, hovered.density)) / Math.log10(5000)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
