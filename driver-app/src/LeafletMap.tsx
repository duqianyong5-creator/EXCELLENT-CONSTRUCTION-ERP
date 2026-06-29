import React, { useRef, useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';

export type MapPos = {
  driverId: string;
  driverName?: string;
  latitude: number;
  longitude: number;
  speed?: number;
};

// 转义,防止司机昵称把 HTML 注入到 WebView 标记里
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

// 免费 OpenStreetMap（Leaflet）地图,无需任何 API Key / 付费绑定,与网页端一致。
// topInset/bottomInset 让地图控件（缩放、图层切换）避开手机状态栏/刘海与底部手势条。
function buildHtml(topInset: number, bottomInset: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#e8eef5;}
  /* 把控件从屏幕最顶/最底挪开，避免被状态栏/刘海/手势条挡住、点不到 */
  .leaflet-top{top:${topInset}px;}
  .leaflet-bottom{bottom:${bottomInset}px;}
  .leaflet-control-layers,.leaflet-bar{box-shadow:0 2px 10px rgba(0,0,0,.25);border-radius:10px;overflow:hidden;}
  .leaflet-bar a{width:38px;height:38px;line-height:38px;font-size:20px;}
  .leaflet-control-layers-toggle{width:40px;height:40px;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false }).setView([35.0, 105.0], 4);
  // 缩放放到左下角，远离顶部状态栏；右上角放图层切换
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  // 免费底图：街道(OSM) + 卫星(Esri)，右上角可切换，均无需 API Key
  var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  });
  var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles © Esri'
  });
  street.addTo(map);
  L.control.layers({ '街道': street, '卫星': satellite }, null, { position: 'topright' }).addTo(map);
  var markers = {};
  window.rnRender = function (list) {
    for (var k in markers) { map.removeLayer(markers[k]); }
    markers = {};
    var pts = [];
    list.forEach(function (p) {
      var m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: '<div style="font-size:26px;line-height:1">🚛</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) });
      m.bindPopup('<b>' + p.name + '</b>' + (p.speed != null ? '<br>速度: ' + p.speed + ' km/h' : ''));
      m.addTo(map);
      markers[p.id] = m;
      pts.push([p.lat, p.lng]);
    });
    if (pts.length === 1) { map.setView(pts[0], 13); }
    else if (pts.length > 1) { map.fitBounds(pts, { padding: [40, 40] }); }
  };
  window.rnFocus = function (id) {
    var m = markers[id];
    if (m) { map.setView(m.getLatLng(), 14); m.openPopup(); }
  };
</script>
</body>
</html>`;
}

export default function LeafletMap({ positions, focusId, style, topInset = 0, bottomInset = 0 }: {
  positions: MapPos[];
  focusId?: string | null;
  style?: StyleProp<ViewStyle>;
  topInset?: number;
  bottomInset?: number;
}) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const html = React.useMemo(() => buildHtml(topInset, bottomInset), [topInset, bottomInset]);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const data = positions
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => ({
        id: p.driverId,
        lat: p.latitude,
        lng: p.longitude,
        name: esc(p.driverName || '司机'),
        speed: p.speed != null ? Math.round(p.speed) : null,
      }));
    ref.current.injectJavaScript(`window.rnRender && window.rnRender(${JSON.stringify(data)}); true;`);
  }, [ready, positions]);

  useEffect(() => {
    if (ready && focusId && ref.current) {
      ref.current.injectJavaScript(`window.rnFocus && window.rnFocus(${JSON.stringify(focusId)}); true;`);
    }
  }, [ready, focusId]);

  return (
    <WebView
      ref={ref}
      source={{ html }}
      style={style}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={() => setReady(true)}
    />
  );
}
