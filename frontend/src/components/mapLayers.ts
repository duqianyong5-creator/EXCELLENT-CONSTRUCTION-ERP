import L from 'leaflet';

// 给 Leaflet 地图加「街道 / 卫星」两个免费底图 + 右上角切换控件。
// 街道：OpenStreetMap；卫星：Esri World Imagery。两者均免费、无需 API Key。
export function addBaseLayers(map: L.Map) {
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri', maxZoom: 19 },
  );
  street.addTo(map); // 默认街道
  L.control.layers({ '街道': street, '卫星': satellite }, undefined, { position: 'topright' }).addTo(map);
}
