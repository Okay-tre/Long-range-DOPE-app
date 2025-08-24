// src/hooks/useFMIWeather.ts
import { useState, useCallback } from "react";
import { fetchFMIWeather, type FMIResult } from "../utils/fmi";

export function useFMIWeather() {
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<FMIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchByGeo = useCallback(async () => {
    setLoading(true);
    setError(null);

    const getPosition = () =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        if (!("geolocation" in navigator)) {
          reject(new Error("Geolocation not available in this browser"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });

    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // Simple cache: avoid refetching within 10 minutes for the same ~1km cell
      const key = `fmi:${lat.toFixed(3)},${lon.toFixed(3)}`;
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached) as { t: number; data: FMIResult };
        if (Date.now() - parsed.t < 10 * 60 * 1000) {
          setLast(parsed.data);
          setLoading(false);
          return parsed.data;
        }
      }

      const data = await fetchFMIWeather(lat, lon);
      setLast(data);
      sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
      return data;
    } catch (e: any) {
      setError(e?.message || "Failed to get weather");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchByGeo, loading, last, error };
}
