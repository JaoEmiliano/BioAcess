import React from "react";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getBombona, getBombonaMovements, checkoutBombona, checkinBombona, assignRfidToBombona, updateBombona, markRfidSeen } from "../services/api";

export default function BombonaDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bombona, setBombona] = useState(null);
  const [movements, setMovements] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ serial: "", label: "", contents: "", latitude: "", longitude: "", rfidUid: "" });
  const mapRef = useRef(null);

  async function load() {
    try {
      const resp = await getBombona(id);
      setBombona(resp.data.bombona);
      const mv = await getBombonaMovements(id, { limit: 200 });
      setMovements(mv.data.movements || []);
      // centralizar mapa
      if (resp.data.bombona?.latitude && mapRef.current) {
        mapRef.current.setView([resp.data.bombona.latitude, resp.data.bombona.longitude], 15);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { load(); }, [id]);

  function initFormFromBombona() {
    setForm({
      serial: bombona.serial || "",
      label: bombona.label || "",
      contents: bombona.contents || "",
      latitude: bombona.latitude != null ? String(bombona.latitude) : "",
      longitude: bombona.longitude != null ? String(bombona.longitude) : "",
      rfidUid: bombona.rfid ? bombona.rfid.uid : "",
    });
  }

  function resetForm() {
    setForm({ serial: "", label: "", contents: "", latitude: "", longitude: "", rfidUid: "" });
  }

  async function handleSave() {
    try {
      const payload = {
        serial: form.serial,
        label: form.label,
        contents: form.contents,
        latitude: form.latitude !== "" ? Number(form.latitude) : null,
        longitude: form.longitude !== "" ? Number(form.longitude) : null,
      };
      await updateBombona(bombona.id, payload);
      // atribuir RFID se diferente / presente
      if (form.rfidUid && form.rfidUid !== (bombona.rfid ? bombona.rfid.uid : "")) {
        await assignRfidToBombona(bombona.id, form.rfidUid);
      } else if (!form.rfidUid && bombona.rfid) {
        // remover vínculo
        await updateBombona(bombona.id, { rfidId: null });
      }
      await load();
      setEditMode(false);
      resetForm();
      alert("Bombona atualizada");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Erro ao salvar bombona");
    }
  }

  if (!bombona) return <p>Carregando...</p>;

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{bombona.serial} {bombona.label ? `— ${bombona.label}` : ""}</h2>
          <div>
            <Link to="/bombonas"><button>Voltar</button></Link>
          </div>
        </div>

        <MapContainer
          center={[bombona.latitude ?? -23.5, bombona.longitude ?? -46.6]}
          zoom={bombona.latitude ? 15 : 5}
          style={{ height: 480, width: "100%", borderRadius: 8 }}
          whenCreated={(m) => (mapRef.current = m)}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {bombona.latitude != null && bombona.longitude != null && (
            <Marker position={[bombona.latitude, bombona.longitude]}>
              <Popup>{bombona.serial}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <aside style={{ width: 420 }}>
        <section style={{ marginBottom: 12 }}>
          {/** modo leitura / edição */}
          <h3>Informações</h3>
          {editMode ? (
            <form onSubmit={async (e) => { e.preventDefault(); await handleSave(); }}>
              <label>Serial</label>
              <input value={form.serial} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} required />

              <label>Label</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />

              <label>Descrição</label>
              <input value={form.contents} onChange={e => setForm(f => ({ ...f, contents: e.target.value }))} />

              <label>Latitude</label>
              <input value={form.latitude ?? ""} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />

              <label>Longitude</label>
              <input value={form.longitude ?? ""} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />

              <label>RFID (UID)</label>
              <input value={form.rfidUid ?? ""} onChange={e => setForm(f => ({ ...f, rfidUid: e.target.value }))} />

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="submit">Salvar</button>
                <button type="button" className="secondary" onClick={() => { setEditMode(false); resetForm(); }}>Cancelar</button>
                <button type="button" className="secondary" onClick={async () => { if (!confirm("Remover vínculo da RFID?")) return; await updateBombona(bombona.id, { rfidId: null }); await load(); }}>Remover RFID</button>
              </div>
            </form>
          ) : (
            <>
              <p><b>Serial:</b> {bombona.serial}</p>
              <p><b>Label:</b> {bombona.label || "-"}</p>
              <p><b>RFID:</b> {bombona.rfid ? bombona.rfid.uid : "-"}</p>
              <p><b>Última leitura:</b> {bombona.rfid && bombona.rfid.lastSeenAt ? new Date(bombona.rfid.lastSeenAt).toLocaleString() : "-"}</p>
              <p><b>Descrição:</b> {bombona.contents || "-"}</p>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => { setEditMode(true); initFormFromBombona(); }}>Editar</button>
                {bombona.rfid && <button onClick={() => { if (confirm("Marcar leitura agora?")) { markRfidSeen(bombona.rfid.uid).then(load).catch(e => { console.error(e); alert("Erro"); }); } }} style={{ marginLeft: 8 }}>Marcar leitura</button>}
              </div>
            </>
          )}
         </section>

        <section style={{ marginBottom: 12 }}>
          <h3>Ações rápidas</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => {
              const toLocation = prompt("Local de saída/rota:");
              if (!toLocation) return;
              checkoutBombona(bombona.id, { toLocation }).then(load).catch(e => { console.error(e); alert("Erro"); });
            }}>Checkout</button>

            <button onClick={() => {
              const atLocation = prompt("Local de chegada:");
              if (!atLocation) return;
              checkinBombona(bombona.id, { atLocation }).then(load).catch(e => { console.error(e); alert("Erro"); });
            }}>Checkin</button>

            <button onClick={() => {
              const uid = prompt("UID da RFID para atribuir:");
              if (!uid) return;
              assignRfidToBombona(bombona.id, uid).then(load).catch(e => { console.error(e); alert("Erro"); });
            }}>Atribuir RFID</button>
          </div>
        </section>

        <section>
          <h3>Movimentos (histórico)</h3>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {movements.length === 0 ? <p>Nenhum movimento</p> : movements.map(m => (
              <div key={m.id} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                <div style={{ fontSize: 13 }}><b>{m.type}</b> — {new Date(m.timestamp).toLocaleString()}</div>
                <div style={{ fontSize: 13, color: "#555" }}>{m.location || "-"}</div>
                {m.metadata && <div style={{ fontSize: 12, color: "#666" }}>coords: {m.metadata.latitude},{m.metadata.longitude}</div>}
                <div style={{ fontSize: 12, color: "#666" }}>actor: {m.actor || "-"}</div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}