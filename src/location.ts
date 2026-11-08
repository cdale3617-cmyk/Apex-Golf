import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
export async function getFix() {
  if (Capacitor.isNativePlatform()) {
    const p = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (p.location !== 'granted') throw new Error('Allow precise location for APEX Golf in phone settings.');
  }
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  if (!Number.isFinite(p.coords.accuracy) || p.coords.accuracy > 25) throw new Error('GPS accuracy is too low. Wait for a clearer fix or set the ball on the map.');
  if (Date.now() - p.timestamp > 30000) throw new Error('That GPS fix is old. Try again.');
  return { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp };
}
