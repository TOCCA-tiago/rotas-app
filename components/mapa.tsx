"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PinoMapa = {
  id: string;
  lat: number;
  lon: number;
  rotulo: string | null; // número da parada; null = selecionada, ainda sem rota
  tooltip: string;
};

type Props = {
  origem: { lat: number; lon: number; endereco: string } | null;
  pinos: PinoMapa[];
  geometria: GeoJSON.LineString | null;
  onMoverPino: (id: string, lat: number, lon: number) => void;
  onMoverOrigem: (lat: number, lon: number) => void;
  focar: { lat: number; lon: number } | null;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function icone(texto: string, cor: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${cor};color:#fff;border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.45)">${esc(texto)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function Mapa({ origem, pinos, geometria, onMoverPino, onMoverOrigem, focar }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef(new Map<string, L.Marker>());
  const origemRef = useRef<L.Marker | null>(null);
  const rotaRef = useRef<L.GeoJSON | null>(null);
  // Callbacks sempre atualizados sem recriar os marcadores
  const cbRef = useRef({ onMoverPino, onMoverOrigem });
  cbRef.current = { onMoverPino, onMoverOrigem };

  useEffect(() => {
    if (!divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current).setView([-15.78, -47.93], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(mapa);
    mapaRef.current = mapa;
    return () => {
      mapa.remove();
      mapaRef.current = null;
      marcadoresRef.current.clear();
      origemRef.current = null;
      rotaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !origem) return;
    if (!origemRef.current) {
      origemRef.current = L.marker([origem.lat, origem.lon], { draggable: true, zIndexOffset: 1000 })
        .on("dragend", (e) => {
          const p = (e.target as L.Marker).getLatLng();
          cbRef.current.onMoverOrigem(p.lat, p.lng);
        })
        .addTo(mapa);
      mapa.setView([origem.lat, origem.lon], 12);
    }
    origemRef.current
      .setLatLng([origem.lat, origem.lon])
      .setIcon(icone("⌂", "#5E3A2B"))
      .bindTooltip(`Saída: ${esc(origem.endereco)}`);
  }, [origem]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const atuais = marcadoresRef.current;
    const ids = new Set(pinos.map((p) => p.id));
    for (const [id, m] of atuais) {
      if (!ids.has(id)) {
        m.remove();
        atuais.delete(id);
      }
    }
    for (const p of pinos) {
      let m = atuais.get(p.id);
      if (!m) {
        m = L.marker([p.lat, p.lon], { draggable: true })
          .on("dragend", (e) => {
            const ll = (e.target as L.Marker).getLatLng();
            cbRef.current.onMoverPino(p.id, ll.lat, ll.lng);
          })
          .addTo(mapa);
        atuais.set(p.id, m);
      }
      m.setLatLng([p.lat, p.lon])
        .setIcon(icone(p.rotulo ?? "•", p.rotulo ? "#764A37" : "#8b95a7"))
        .bindTooltip(p.tooltip);
    }
  }, [pinos]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    rotaRef.current?.remove();
    rotaRef.current = null;
    if (geometria) {
      rotaRef.current = L.geoJSON(geometria, { style: { color: "#2a6385", weight: 5, opacity: 0.85 } }).addTo(mapa);
      mapa.fitBounds(rotaRef.current.getBounds(), { padding: [30, 30] });
    }
  }, [geometria]);

  useEffect(() => {
    if (focar && mapaRef.current) mapaRef.current.panTo([focar.lat, focar.lon]);
  }, [focar]);

  return <div ref={divRef} className="h-full w-full" />;
}
