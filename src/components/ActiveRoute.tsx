import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Package, Navigation, CheckCircle, XCircle, Loader2, Lock } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ImportedData } from "@/pages/Index";
import { getPreferredNavApp, openExternalNavigation } from "@/lib/external-navigation";
import { useSubscriptionDays } from "@/hooks/useSubscriptionDays";
import iconGoogleMaps from "@/assets/icon-google-maps.png";
import iconWaze from "@/assets/icon-waze.png";

// Mapbox public token
mapboxgl.accessToken = "pk.eyJ1IjoicGFpdmEwMDciLCJhIjoiY21pYm4yOHphMDNocTJqb2w5OTlhZWk5bCJ9.nYQcx0AWey8p5P2R1mWJQQ";

const FREE_LIMIT = 3;

interface ActiveRouteProps {
  onNavigate: (screen: string) => void;
  importedData: ImportedData | null;
}

const ActiveRoute = ({ onNavigate, importedData }: ActiveRouteProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [driverCoords, setDriverCoords] = useState<[number, number] | null>(null);
  const navApp = getPreferredNavApp();
  const { daysRemaining } = useSubscriptionDays();
  const hasActivePlan = (daysRemaining ?? 0) > 0;
  const isLocked = !hasActivePlan && currentIndex >= FREE_LIMIT;

  // 1. Extração de dados reais da sua planilha (conforme a imagem)
  const currentRow = importedData?.rows[currentIndex];
  
  const currentAddress = currentRow ? String(currentRow["Destination Address"] || "") : "";
  const destLat = currentRow ? parseFloat(String(currentRow["Latitude"]).replace(',', '.')) : null;
  const destLng = currentRow ? parseFloat(String(currentRow["Longitude"]).replace(',', '.')) : null;
  
  const total = importedData?.totalAddresses || 0;
  const progress = currentIndex + 1;
  const percent = total > 0 ? (progress / total) * 100 : 0;

  // 2. Monitorar GPS real do motorista
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setDriverCoords([pos.coords.longitude, pos.coords.latitude]);
        },
        (err) => console.error("Erro GPS:", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 3. Inicializar e atualizar o mapa com os dados da planilha
  useEffect(() => {
    if (!mapContainer.current) return;

    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: driverCoords || (destLng && destLat ? [destLng, destLat] : [-43.67, -22.95]),
        zoom: 15,
        attributionControl: false,
      });
    }

    const map = mapRef.current;

    // Marcador do Motorista (Verde - gota)
    if (driverCoords) {
      if (!driverMarkerRef.current) {
        const el = document.createElement("div");
        el.innerHTML = `<div style="width:32px;height:32px;background:#27AE60;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div>`;
        driverMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(driverCoords).addTo(map);
      } else {
        driverMarkerRef.current.setLngLat(driverCoords);
      }
    }

    // Remover marcadores antigos
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();
    if (driverCoords) bounds.extend(driverCoords);

    // Criar marcadores para todas as paradas
    const rows = importedData?.rows || [];
    rows.forEach((row, i) => {
      const lat = parseFloat(String(row["Latitude"]).replace(',', '.'));
      const lng = parseFloat(String(row["Longitude"]).replace(',', '.'));
      if (isNaN(lat) || isNaN(lng)) return;

      const isCurrent = i === currentIndex;
      const isDone = i < currentIndex;
      const seqNumber = i + 1;
      const color = isDone ? "#9CA3AF" : isCurrent ? "#7B61FF" : "#3B82F6";
      const size = isCurrent ? 32 : 24;
      const h = isCurrent ? 42 : 31;
      const fontSize = isCurrent ? 13 : 10;
      const textY = isCurrent ? 18 : 13;
      const halfW = size / 2;

      const pinSvg = `<svg width="${size}" height="${h}" viewBox="0 0 ${size} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M${halfW} ${h - 1}C${halfW} ${h - 1} ${size - 1} ${Math.round(h * 0.6)} ${size - 1} ${Math.round(size * 0.46)}C${size - 1} ${Math.round(size * 0.16)} ${Math.round(size * 0.77)} 1 ${halfW} 1C${Math.round(size * 0.23)} 1 1 ${Math.round(size * 0.16)} 1 ${Math.round(size * 0.46)}C1 ${Math.round(h * 0.6)} ${halfW} ${h - 1} ${halfW} ${h - 1}Z" fill="${color}" stroke="#fff" stroke-width="1.5" ${isDone ? 'opacity="0.6"' : ""}/>
        <text x="${halfW}" y="${textY}" text-anchor="middle" fill="#fff" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif">${seqNumber}</text>
      </svg>`;

      const el = document.createElement("div");
      el.innerHTML = pinSvg;
      el.style.cursor = "pointer";
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
      stopMarkersRef.current.push(marker);
      bounds.extend([lng, lat]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, duration: 1000 });
    }
  }, [driverCoords, currentIndex, importedData]);

  const handleNext = () => {
    if (currentIndex < total - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);

      // Auto-open external nav for next stop
      const nextRow = importedData?.rows[nextIndex];
      if (nextRow && navApp !== 'app') {
        const lat = parseFloat(String(nextRow["Latitude"]).replace(',', '.'));
        const lng = parseFloat(String(nextRow["Longitude"]).replace(',', '.'));
        if (!isNaN(lat) && !isNaN(lng)) {
          openExternalNavigation(lat, lng);
        }
      }
    } else {
      onNavigate("dashboard");
    }
  };

  const handleOpenNav = () => {
    if (destLat && destLng) {
      openExternalNavigation(destLat, destLng);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="relative" style={{ height: "340px" }}>
        <div ref={mapContainer} className="w-full h-full" />
        
        <button onClick={() => onNavigate("dashboard")} className="absolute top-4 left-4 w-9 h-9 bg-card rounded-full shadow-card flex items-center justify-center z-10">
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="flex-1 bg-background px-5 pt-4 pb-6 overflow-y-auto">
        {isLocked ? (
          <div className="bg-card rounded-[20px] shadow-card p-6 mb-4 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Lock size={28} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-2">Limite atingido</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No modo gratuito, apenas <span className="font-bold">{FREE_LIMIT}</span> entregas podem ser navegadas. 
                Ative um plano mensal para navegar por todas as <span className="font-bold">{total}</span> entregas.
              </p>
            </div>
            <button 
              onClick={() => onNavigate("subscription")}
              className="w-full gradient-primary text-white font-bold text-base py-3.5 rounded-[18px] shadow-button flex items-center justify-center gap-2"
            >
              Ver planos disponíveis
            </button>
            <button 
              onClick={() => onNavigate("dashboard")}
              className="text-sm font-medium text-muted-foreground"
            >
              Voltar ao início
            </button>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-[20px] shadow-card p-5 mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Próxima parada</p>
              <h2 className="text-lg font-bold text-foreground mb-4 leading-tight">
                {currentAddress || "Endereço não identificado"}
              </h2>

              <div className="flex flex-col gap-2.5 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-orange-500/10">
                    <Package size={15} className="text-orange-500" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    Pacotes: {currentRow?.["Sequence"] || "N/A"}
                  </span>
                </div>
              </div>

              <div className="mb-1.5">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full gradient-primary transition-all duration-500" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground font-medium">{progress}/{total} entregas</span>
                <span className="text-xs font-semibold text-primary">{Math.round(percent)}%</span>
              </div>

              {!hasActivePlan && (
                <div className="mt-3 bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Lock size={12} className="text-amber-500" />
                  <span className="text-[10px] text-amber-700 font-medium">
                    Gratuito: {FREE_LIMIT - currentIndex - 1} entrega(s) restante(s)
                  </span>
                </div>
              )}
            </div>

            {navApp !== 'app' && destLat && destLng && (
              <button
                onClick={handleOpenNav}
                className="gradient-primary rounded-[16px] shadow-button py-3 flex items-center justify-center gap-2 mb-3"
              >
                <img
                  src={navApp === 'waze' ? iconWaze : iconGoogleMaps}
                  alt={navApp === 'waze' ? 'Waze' : 'Google Maps'}
                  className="w-5 h-5 object-contain rounded"
                />
                <span className="text-sm font-bold text-white">
                  Navegar com {navApp === 'waze' ? 'Waze' : 'Google Maps'}
                </span>
              </button>
            )}

            <div className="grid grid-cols-3 gap-3">
              <button onClick={handleOpenNav} className="bg-card rounded-[16px] shadow-card py-4 flex flex-col items-center justify-center gap-1.5">
                <Navigation size={18} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Navegar</span>
              </button>
              <button onClick={handleNext} className="gradient-primary rounded-[16px] shadow-button py-4 flex flex-col items-center justify-center gap-1.5">
                <CheckCircle size={18} className="text-white" />
                <span className="text-xs font-bold text-white">Entregue</span>
              </button>
              <button onClick={handleNext} className="bg-card rounded-[16px] shadow-card py-4 flex flex-col items-center justify-center gap-1.5">
                <XCircle size={18} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Não entregue</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ActiveRoute;