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
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
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
        el.innerHTML = `<svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 51C20 51 38 30.5 38 19C38 8.50659 29.9411 2 20 2C10.0589 2 2 8.50659 2 19C2 30.5 20 51 20 51Z" fill="#27AE60" stroke="#fff" stroke-width="2.5"/>
          <circle cx="20" cy="19" r="10" fill="#fff"/>
          <polygon points="16,15 16,23 24,19" fill="#27AE60"/>
        </svg>`;
        el.style.cursor = "pointer";
        driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat(driverCoords).addTo(map);
      } else {
        driverMarkerRef.current.setLngLat(driverCoords);
      }
    }

    // Marcador de Destino (gota com número de sequência)
    if (destLng && destLat) {
      const seqNumber = currentIndex + 1;
      if (!destMarkerRef.current) {
        const el = document.createElement("div");
        el.innerHTML = `<svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 51C20 51 38 30.5 38 19C38 8.50659 29.9411 2 20 2C10.0589 2 2 8.50659 2 19C2 30.5 20 51 20 51Z" fill="#7B61FF" stroke="#fff" stroke-width="2.5"/>
          <text x="20" y="23" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold" font-family="Arial, sans-serif">${seqNumber}</text>
        </svg>`;
        el.style.cursor = "pointer";
        destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([destLng, destLat]).addTo(map);
      } else {
        // Update number and position
        const el = destMarkerRef.current.getElement();
        el.innerHTML = `<svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 51C20 51 38 30.5 38 19C38 8.50659 29.9411 2 20 2C10.0589 2 2 8.50659 2 19C2 30.5 20 51 20 51Z" fill="#7B61FF" stroke="#fff" stroke-width="2.5"/>
          <text x="20" y="23" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold" font-family="Arial, sans-serif">${seqNumber}</text>
        </svg>`;
        destMarkerRef.current.setLngLat([destLng, destLat]);
      }

      // Ajustar visão para mostrar motorista e destino
      const bounds = new mapboxgl.LngLatBounds();
      if (driverCoords) bounds.extend(driverCoords);
      bounds.extend([destLng, destLat]);
      
      map.fitBounds(bounds, { padding: 60, duration: 1000 });
    }
  }, [driverCoords, destLat, destLng]);

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