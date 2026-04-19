import * as Location from 'expo-location';

/**
 * Attempt to get the device's current location for distance filtering.
 * Returns { latitude, longitude } on success, null on denial/error.
 *
 * Does NOT throw — distance filtering is a nice-to-have, not essential.
 * Callers should fall back to whatever feed they have.
 */
export async function getDeviceLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Reverse-geocode a (lat, lng) pair to get a postal code.
 * Used at listing creation time to snapshot a friendly location.
 * Returns null on any failure.
 */
export async function getZipFromCoords(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return results?.[0]?.postalCode || null;
  } catch {
    return null;
  }
}
