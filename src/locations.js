/**
 * Curated real coordinates inside Israel. Each dummy activity gets one of these
 * with a small random jitter so points vary a little but always stay in-country.
 */

const ISRAEL_LOCATIONS = [
  { name: 'Tel Aviv', latitude: 32.0853, longitude: 34.7818 },
  { name: 'Jerusalem', latitude: 31.7683, longitude: 35.2137 },
  { name: 'Haifa', latitude: 32.7940, longitude: 34.9896 },
  { name: "Be'er Sheva", latitude: 31.2518, longitude: 34.7913 },
  { name: 'Eilat', latitude: 29.5581, longitude: 34.9482 },
  { name: 'Netanya', latitude: 32.3215, longitude: 34.8532 },
  { name: 'Rishon LeZion', latitude: 31.9730, longitude: 34.7925 },
  { name: 'Herzliya', latitude: 32.1663, longitude: 34.8433 },
  { name: 'Tiberias', latitude: 32.7959, longitude: 35.5300 },
  { name: 'Nazareth', latitude: 32.7021, longitude: 35.2978 },
  { name: 'Ashdod', latitude: 31.8014, longitude: 34.6435 },
  { name: 'Ramat Gan', latitude: 32.0684, longitude: 34.8248 },
  { name: 'Petah Tikva', latitude: 32.0840, longitude: 34.8878 },
  { name: 'Holon', latitude: 32.0158, longitude: 34.7874 },
  { name: 'Ashkelon', latitude: 31.6688, longitude: 34.5715 },
];

// ±0.01° ≈ ±1.1 km — enough variety, still safely inside the city / country.
const JITTER = 0.01;

export function randomIsraeliLocation() {
  const base = ISRAEL_LOCATIONS[Math.floor(Math.random() * ISRAEL_LOCATIONS.length)];
  const jitter = () => (Math.random() * 2 - 1) * JITTER;
  return {
    name: base.name,
    latitude: Number((base.latitude + jitter()).toFixed(6)),
    longitude: Number((base.longitude + jitter()).toFixed(6)),
  };
}

export { ISRAEL_LOCATIONS };
