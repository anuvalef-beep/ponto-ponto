import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, Bus, Navigation, KeyRound, Loader2, MapPin, X, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Bus Icon Factory
const getBusIcon = (colorHex: string) => {
  const html = `
    <div style="background-color: ${colorHex}; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1); border: 2px solid white; transition: transform 0.2s;">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
    </div>
  `;
  return L.divIcon({
    html: html,
    className: 'custom-bus-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
};

const busIconIda = getBusIcon('#4f46e5'); // Indigo 600
const busIconVolta = getBusIcon('#f97316'); // Orange 500

interface SPTransLine {
  cl: number;    // Código da linha
  lc: boolean;   // Letreiro principal
  lt: string;    // Letreiro alfanumérico (ex: 8000-10)
  sl: number;    // Sentido
  tl: number;    // Terminal principal
  tp: string;    // Letreiro destino principal
  ts: string;    // Letreiro destino secundário
}

interface SPTransStop {
  cp: number;
  np: string;
  py: number;
  px: number;
}

// Map updater component to fly to location with bounds
function MapUpdater({ stops, center }: { stops: SPTransStop[], center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length > 0) {
      const bounds = L.latLngBounds(stops.map(s => [s.py, s.px]));
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.flyTo(center, map.getZoom());
    }
  }, [stops, center, map]);
  return null;
}

export function TrackingView() {
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedLinePair, setSelectedLinePair] = useState<{
    dir1: SPTransLine | null;
    dir2: SPTransLine | null;
  } | null>(null);
  const [visibleDirection, setVisibleDirection] = useState<'1' | '2' | 'both'>('1');

  const [buses1, setBuses1] = useState<Array<{ id: string, lat: number, lng: number }>>([]);
  const [buses2, setBuses2] = useState<Array<{ id: string, lat: number, lng: number }>>([]);
  const [stops1, setStops1] = useState<SPTransStop[]>([]);
  const [stops2, setStops2] = useState<SPTransStop[]>([]);

  const [mapCenter, setMapCenter] = useState<[number, number]>([-23.55052, -46.633308]); // Default to São Paulo
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [searchResults, setSearchResults] = useState<SPTransLine[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/sptrans/status');
        const data = await res.json();
        setIsAuthenticated(data.configured);
      } catch (e) {
        console.error("Failed to check SPTrans configuration status", e);
      }
    };
    checkStatus();
  }, []);

  // Search lines when query changes
  useEffect(() => {
    if (!isAuthenticated || searchQuery.length < 2) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/sptrans/Linha/Buscar?termosBusca=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Erro na busca:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, isAuthenticated]);

  const handleSelectLine = async (line: SPTransLine) => {
    setIsSidebarOpen(false);
    
    // We try to find both directions in search results. 
    // Usually they are both there if searched by number. 
    // If not, we could fetch by `lt` to guarantee we have both.
    let dir1 = searchResults.find(l => l.lt === line.lt && l.sl === 1) || null;
    let dir2 = searchResults.find(l => l.lt === line.lt && l.sl === 2) || null;

    if (!dir1 || !dir2) {
      try {
        const res = await fetch(`/api/sptrans/Linha/Buscar?termosBusca=${encodeURIComponent(line.lt)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          if (!dir1) dir1 = data.find(l => l.lt === line.lt && l.sl === 1) || null;
          if (!dir2) dir2 = data.find(l => l.lt === line.lt && l.sl === 2) || null;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!dir1 && line.sl === 1) dir1 = line;
    if (!dir2 && line.sl === 2) dir2 = line;

    setSelectedLinePair({ dir1, dir2 });
    setVisibleDirection(line.sl === 1 ? '1' : '2');
  };

  const fetchSPTransPositions = async (codigoLinha: number) => {
    if (!isAuthenticated) return [];
    try {
      const response = await fetch(`/api/sptrans/Posicao/Linha?codigoLinha=${codigoLinha}`);
      const data = await response.json();

      if (data && data.vs) {
        return data.vs.map((bus: any) => ({
          id: bus.p, // Prefixo do veículo
          lat: bus.py, // Latitude
          lng: bus.px, // Longitude
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar dados da SPTrans:", error);
    }
    return [];
  };

  const fetchSPTransStops = async (codigoLinha: number) => {
    if (!isAuthenticated) return [];
    try {
      const response = await fetch(`/api/sptrans/Parada/BuscarParadasPorLinha?codigoLinha=${codigoLinha}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        return data;
      }
    } catch (error) {
      console.error("Erro ao buscar paradas:", error);
    }
    return [];
  };

  useEffect(() => {
    if (!selectedLinePair) return;

    setStops1([]);
    setStops2([]);
    setBuses1([]);
    setBuses2([]);

    const fetchAll = async () => {
      let b1: any[] = [];
      let b2: any[] = [];
      
      if (selectedLinePair.dir1) {
        fetchSPTransStops(selectedLinePair.dir1.cl).then(setStops1);
        b1 = await fetchSPTransPositions(selectedLinePair.dir1.cl);
        setBuses1(b1);
      }
      if (selectedLinePair.dir2) {
        fetchSPTransStops(selectedLinePair.dir2.cl).then(setStops2);
        b2 = await fetchSPTransPositions(selectedLinePair.dir2.cl);
        setBuses2(b2);
      }

      // Centers map on the first found bus from any direction
      if (b1.length > 0) setMapCenter([b1[0].lat, b1[0].lng]);
      else if (b2.length > 0) setMapCenter([b2[0].lat, b2[0].lng]);
    };

    fetchAll();

    const interval = setInterval(() => {
      if (selectedLinePair.dir1) fetchSPTransPositions(selectedLinePair.dir1.cl).then(setBuses1);
      if (selectedLinePair.dir2) fetchSPTransPositions(selectedLinePair.dir2.cl).then(setBuses2);
    }, 15000);

    return () => clearInterval(interval);
  }, [selectedLinePair]);

  return (
    <div className="relative h-[calc(100vh-80px)] w-full flex flex-col md:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900">
      
      {/* Configuration Missing Overlay */}
      {!isAuthenticated && (
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-xl max-w-md w-full mx-4 border border-slate-100 dark:border-slate-700 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Token Ausente</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              O token da SPTrans não foi configurado no servidor. Adicione a variável de ambiente <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">SPTRANS_TOKEN</code> para ativar o rastreio.
            </p>
          </div>
        </div>
      )}

      {/* Sidebar / Bottom Sheet (Mobile) & Left Sidebar (Desktop) */}
      <div 
        className={cn(
          "absolute z-[1001] bg-white dark:bg-slate-800 flex flex-col transition-transform duration-300 ease-spring shadow-2xl",
          // Mobile Bottom Sheet styling & Desktop floating styling
          "bottom-0 left-0 right-0 md:top-0 md:bottom-0 rounded-t-[2rem] md:rounded-none md:rounded-r-2xl h-[85vh] md:h-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-r border-slate-200 dark:border-slate-700",
          !isSidebarOpen ? "translate-y-full md:translate-y-0 md:-translate-x-full" : "translate-y-0 md:translate-x-0"
        )}
      >
        <div className="p-4 flex items-center justify-between pb-2 border-b md:border-b-0 border-slate-100 dark:border-slate-700">
          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-4 md:hidden"></div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mt-4 md:mt-0 ml-2 flex items-center gap-2">
            <Bus className="w-5 h-5 text-indigo-600" />
            Buscar Linha
          </h2>
          <button 
            className="p-2 mt-4 md:mt-0 text-slate-400 hover:bg-slate-100 rounded-full dark:hover:bg-slate-700 transition-colors"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Digite o número (ex: 8000)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={!isAuthenticated}
              className="w-full pl-10 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center p-10 text-slate-400 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-sm font-medium">Buscando na SPTrans...</span>
            </div>
          ) : searchResults.map(line => {
            const isSelected = selectedLinePair?.dir1?.cl === line.cl || selectedLinePair?.dir2?.cl === line.cl;
            
            return (
              <button
                key={line.cl}
                onClick={() => handleSelectLine(line)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl mb-3 flex flex-col gap-2 transition-all active:scale-[0.98]",
                  isSelected 
                    ? "bg-indigo-600 shadow-xl shadow-indigo-600/20 text-white border-transparent" 
                    : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "font-mono px-2.5 py-1 rounded-md text-xs font-black tracking-wider text-center",
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  )}>
                    {line.lt}
                  </span>
                  <span className="font-bold text-sm truncate flex-1 leading-tight">
                    {line.tp}
                  </span>
                </div>
                <div className={cn(
                  "flex items-center gap-2 mt-1 text-xs font-medium",
                  isSelected ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"
                )}>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Para {line.ts}</span>
                </div>
              </button>
            );
          })}
          {!isSearching && searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              Nenhuma linha encontrada com "{searchQuery}".
            </div>
          )}
          {!isSearching && searchQuery.length < 2 && (
            <div className="p-8 pb-4 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Navigation className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Digite para Buscar</p>
              <p className="text-xs text-slate-400">Pesquise pelo número ou nome da linha (mínimo 2 letras/números).</p>
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0 h-full w-full">
        {/* Floating Top Bar (Search Trigger) */}
        {!isSidebarOpen && (
          <div className="absolute top-4 left-4 right-4 md:right-auto md:w-[22rem] z-[1000]">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="flex items-center gap-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] px-4 py-3.5 rounded-2xl border border-slate-100 dark:border-slate-700 w-full transition-all active:scale-95 hover:bg-slate-50 dark:hover:bg-slate-700"
              disabled={!isAuthenticated}
            >
              <div className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 p-1.5 rounded-lg flex-shrink-0">
                <Search className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate flex-1 text-left">
                {(selectedLinePair?.dir1 || selectedLinePair?.dir2) 
                  ? `${(selectedLinePair.dir1 || selectedLinePair.dir2)!.lt} - ${(selectedLinePair.dir1 || selectedLinePair.dir2)!.tp}` 
                  : "Pesquise uma linha aqui..."}
              </span>
            </button>
          </div>
        )}

        <MapContainer 
          center={mapCenter} 
          zoom={14} 
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {selectedLinePair && (
            <>
              <MapUpdater stops={visibleDirection === '1' ? stops1 : (visibleDirection === '2' ? stops2 : (stops1.length ? stops1 : stops2))} center={mapCenter} />
              
              {/* Direction 1 (Ida) */}
              {(visibleDirection === '1' || visibleDirection === 'both') && selectedLinePair.dir1 && (
                <>
                  {/* Draw Route Line connecting the stops */}
                  {stops1.length > 0 && (
                    <Polyline 
                      positions={stops1.map(s => [s.py, s.px])} 
                      pathOptions={{ color: '#4f46e5', weight: 4, opacity: 0.6 }} 
                    />
                  )}

                  {/* Draw Stop Markers */}
                  {stops1.map(stop => (
                    <CircleMarker 
                      key={`stop1-${stop.cp}`} 
                      center={[stop.py, stop.px]} 
                      radius={4} 
                      pathOptions={{ color: '#4f46e5', fillColor: 'white', fillOpacity: 1, weight: 2 }}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="font-bold text-xs rounded-xl shadow-lg border-0">
                        <span className="text-slate-800">{stop.np}</span>
                      </Tooltip>
                    </CircleMarker>
                  ))}

                  {/* Draw Buses */}
                  {buses1.map(bus => {
                    const origin = selectedLinePair.dir1!.tp;
                    const destination = selectedLinePair.dir1!.ts;
                    
                    return (
                      <Marker key={`bus1-${bus.id}`} position={[bus.lat, bus.lng]} icon={busIconIda}>
                        <Popup className="rounded-xl overflow-hidden min-w-[200px]" closeButton={false}>
                          <div className="-m-5">
                            <div className="bg-indigo-600 text-white p-3 text-center">
                              <p className="font-mono text-sm opacity-90">Prefixo</p>
                              <p className="font-black text-xl tracking-wider">{bus.id}</p>
                            </div>
                            <div className="p-3 bg-white">
                              <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Trajeto Atual (Ida)</p>
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <span className="truncate flex-1 text-right" title={origin}>{origin}</span>
                                <ArrowRight className="w-4 h-4 flex-shrink-0 text-indigo-500" />
                                <span className="truncate flex-1" title={destination}>{destination}</span>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </>
              )}

              {/* Direction 2 (Volta) */}
              {(visibleDirection === '2' || visibleDirection === 'both') && selectedLinePair.dir2 && (
                <>
                  {/* Draw Route Line connecting the stops */}
                  {stops2.length > 0 && (
                    <Polyline 
                      positions={stops2.map(s => [s.py, s.px])} 
                      pathOptions={{ color: '#f97316', weight: 4, opacity: 0.6 }} 
                    />
                  )}

                  {/* Draw Stop Markers */}
                  {stops2.map(stop => (
                    <CircleMarker 
                      key={`stop2-${stop.cp}`} 
                      center={[stop.py, stop.px]} 
                      radius={4} 
                      pathOptions={{ color: '#f97316', fillColor: 'white', fillOpacity: 1, weight: 2 }}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={1} className="font-bold text-xs rounded-xl shadow-lg border-0">
                        <span className="text-slate-800">{stop.np}</span>
                      </Tooltip>
                    </CircleMarker>
                  ))}

                  {/* Draw Buses */}
                  {buses2.map(bus => {
                    const origin = selectedLinePair.dir2!.tp;
                    const destination = selectedLinePair.dir2!.ts;
                    
                    return (
                      <Marker key={`bus2-${bus.id}`} position={[bus.lat, bus.lng]} icon={busIconVolta}>
                        <Popup className="rounded-xl overflow-hidden min-w-[200px]" closeButton={false}>
                          <div className="-m-5">
                            <div className="bg-orange-500 text-white p-3 text-center">
                              <p className="font-mono text-sm opacity-90">Prefixo</p>
                              <p className="font-black text-xl tracking-wider">{bus.id}</p>
                            </div>
                            <div className="p-3 bg-white">
                              <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Trajeto Atual (Volta)</p>
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <span className="truncate flex-1 text-right" title={origin}>{origin}</span>
                                <ArrowRight className="w-4 h-4 flex-shrink-0 text-orange-500" />
                                <span className="truncate flex-1" title={destination}>{destination}</span>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </>
              )}
            </>
          )}
        </MapContainer>

        {/* Selected Line Badge & Toggle System Overlay */}
        {selectedLinePair && isAuthenticated && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center gap-3 w-full max-w-sm px-4 md:max-w-max">
            {/* Top Indicator */}
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-5 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 dark:border-slate-700 flex items-center justify-center gap-3">
              <div className="bg-slate-800 text-white px-2.5 py-0.5 rounded font-mono font-bold text-sm tracking-wider">
                {selectedLinePair.dir1?.lt || selectedLinePair.dir2?.lt}
              </div>
              
              {visibleDirection !== 'both' && (
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <span className="truncate max-w-[100px] md:max-w-[150px]">
                    {visibleDirection === '1' ? selectedLinePair.dir1?.tp : selectedLinePair.dir2?.tp}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="truncate max-w-[100px] md:max-w-[150px]">
                    {visibleDirection === '1' ? selectedLinePair.dir1?.ts : selectedLinePair.dir2?.ts}
                  </span>
                </div>
              )}
              {visibleDirection === 'both' && (
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  Visualizando Ambos os Sentidos
                </span>
              )}
            </div>

            {/* View Direction Toggle */}
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-1.5 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 flex">
              <button
                onClick={() => setVisibleDirection('1')}
                disabled={!selectedLinePair.dir1}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 min-w-[70px] justify-center",
                  visibleDirection === '1' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 focus:outline-none disabled:opacity-30 disabled:hover:text-slate-500"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", visibleDirection === '1' ? "bg-white" : "bg-indigo-600")} />
                Ida
              </button>
              <button
                onClick={() => setVisibleDirection('both')}
                disabled={!selectedLinePair.dir1 || !selectedLinePair.dir2}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-colors focus:outline-none disabled:opacity-30",
                  visibleDirection === 'both' 
                    ? "bg-slate-800 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                Ambos
              </button>
              <button
                onClick={() => setVisibleDirection('2')}
                disabled={!selectedLinePair.dir2}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 min-w-[70px] justify-center focus:outline-none disabled:opacity-30 disabled:hover:text-slate-500",
                  visibleDirection === '2' 
                    ? "bg-orange-500 text-white shadow-sm" 
                    : "text-slate-500 hover:text-orange-500 dark:text-slate-400 dark:hover:text-orange-400"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", visibleDirection === '2' ? "bg-white" : "bg-orange-500")} />
                Volta
              </button>
            </div>
          </div>
        )}

        {!selectedLinePair && isAuthenticated && (
          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[400] flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-2xl shadow-indigo-900/10 border border-slate-100 dark:border-slate-700 text-center max-w-xs mx-4 pointer-events-auto mt-16 md:mt-0">
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">Selecione uma Linha</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Busque uma linha no menu para visualizar a rota e os ônibus oficiais em tempo real.
              </p>
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden mt-6 w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform"
              >
                Pesquisar Linha
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Removed old Sidebar code since it was moved above MapArea */}
    </div>
  );
}
