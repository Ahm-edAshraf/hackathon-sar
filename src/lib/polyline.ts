// Minimal Google encoded polyline decoder returning [lat, lon] tuples.
export function decodeGooglePolyline(value: string): Array<[number, number]> {
  if (!value) {
    return [];
  }

  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < value.length) {
    const resultLat = decodeChunk(value, index);
    lat += resultLat.value;
    index = resultLat.nextIndex;

    const resultLon = decodeChunk(value, index);
    lon += resultLon.value;
    index = resultLon.nextIndex;

    coordinates.push([lat * 1e-5, lon * 1e-5]);
  }

  return coordinates;
}

function decodeChunk(str: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte: number;

  do {
    byte = str.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < str.length);

  const shouldNegate = result & 1;
  const value = shouldNegate ? ~(result >> 1) : result >> 1;
  return { value, nextIndex: index };
}
