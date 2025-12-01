import React from "react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import BombonaList from "./components/BombonaList";
import QuickCreate from "./components/QuickCreate";
import CheckinCheckout from "./components/CheckinCheckout";
import UnlinkedRfids from "./components/UnlinkedRfids";
import { getBombonas } from "./services/api";

// Ícone padrão do Leaflet corrigido (sem erro de imagem quebrada)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bombonas, setBombonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("list"); // list | create | movement

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("loggedUser"));
    if (!storedUser) {
      navigate("/");
    } else {
      setUser(storedUser);
    }
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const resp = await getBombonas();
      setBombonas(resp.data.bombonas || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function focusOn(b) {
    setSelected(b);
    if (mapRef.current && b.latitude != null && b.longitude != null) {
      mapRef.current.setView([b.latitude, b.longitude], 15);
    }
  }

  if (!user) return null;

  return (
    <div className="dashboard-container" style={{ display: "flex", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <header className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Dashboard</h1>
          <div>
            <p>Bem-vindo, <strong>{user.name}</strong></p>
            <button onClick={() => { localStorage.removeItem("loggedUser"); navigate("/"); }}>Sair</button>
          </div>
        </header>

        <MapContainer
          center={[-23.653113046030906, -52.61336181534213]}
          zoom={5}
          style={{ height: "600px", width: "100%", borderRadius: "10px" }}
          whenCreated={(mapInstance) => (mapRef.current = mapInstance)}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {bombonas.map((b) =>
            b.latitude != null && b.longitude != null ? (
              <Marker key={b.id} position={[b.latitude, b.longitude]}>
                <Popup>
                  <b>{b.serial}</b><br/>
                  {b.label}<br/>
                  RFID: {b.rfid ? b.rfid.uid : "-"}<br/>
                  Última leitura: {b.rfid && b.rfid.lastSeenAt ? new Date(b.rfid.lastSeenAt).toLocaleString() : "-"}
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
      </div>

      <aside style={{ width: 380, maxHeight: "600px", overflow: "auto", borderLeft: "1px solid #ddd", paddingLeft: 12 }}>
        <div className="sidebar-tabs" role="tablist" aria-label="Navegação">
          <button className={tab === "list" ? "active" : ""} onClick={() => setTab("list")} type="button">Lista</button>
          <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")} type="button">Novo</button>
          <button className={tab === "movement" ? "active" : ""} onClick={() => setTab("movement")} type="button">Movimentos</button>
          <button className={tab === "rfids" ? "active" : ""} onClick={() => setTab("rfids")} type="button">RFIDs</button>
        </div>

        {tab === "list" && (
          <BombonaList onSelect={(b) => { focusOn(b); setSelected(b); }} refresh={load} items={bombonas} loading={loading} />
        )}

        {tab === "create" && (
          <QuickCreate onCreated={load} />
        )}

        {tab === "movement" && (
          <CheckinCheckout bombonas={bombonas} onDone={load} />
        )}

        {tab === "rfids" && (
          <UnlinkedRfids onAssigned={load} />
        )}

        {/* detalhes rápidos */}
        {selected && (
          <div style={{ marginTop: 12, padding: 8, background: "#fafafa", borderRadius: 6 }}>
            <h3>Detalhes — {selected.serial}</h3>
            <p><b>Label:</b> {selected.label}</p>
            <p><b>RFID:</b> {selected.rfid ? selected.rfid.uid : "-"}</p>
            <p><b>Última leitura:</b> {selected.rfid && selected.rfid.lastSeenAt ? new Date(selected.rfid.lastSeenAt).toLocaleString() : "-"}</p>
            <p><b>Descrição:</b> {selected.contents || "-"}</p>
            <p><b>Coordenadas:</b> {selected.latitude != null ? `${selected.latitude}, ${selected.longitude}` : "-"}</p>

            {/* Botão para abrir a página de detalhes completa */}
            <div style={{ marginTop: 10 }}>
              <button
                className="small-button"
                onClick={() => navigate(`/bombonas/${selected.id}`)}
                type="button"
              >
                Ver detalhes
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
