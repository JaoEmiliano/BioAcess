import React from "react";
import { useEffect, useState, useMemo } from "react";
import { getUnlinkedRfids, getBombonas, assignRfidToBombonaByUid } from "../services/api";

export default function UnlinkedRfids({ onAssigned }) {
  const [rfids, setRfids] = useState([]);
  const [bombonas, setBombonas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(null); // uid em atribuição
  const [openAssignUid, setOpenAssignUid] = useState(null); // uid cujo painel de autocomplete está aberto
  const [searchText, setSearchText] = useState("");
  const [selectedBombonaId, setSelectedBombonaId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [rRes, bRes] = await Promise.all([getUnlinkedRfids(), getBombonas()]);
      setRfids(rRes.data.rfids || []);
      setBombonas(bRes.data.bombonas || []);
    } catch (err) {
      console.error(err);
      setRfids([]);
      setBombonas([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // sugestões filtradas por searchText
  const suggestions = useMemo(() => {
    const t = (searchText || "").toLowerCase().trim();
    if (!t) return bombonas.slice(0, 10);
    return bombonas.filter(b =>
      String(b.serial).toLowerCase().includes(t) ||
      (b.label && String(b.label).toLowerCase().includes(t))
    ).slice(0, 10);
  }, [searchText, bombonas]);

  async function handleAssign(uid, bombonaId) {
    if (!bombonaId) return alert("Selecione uma bombona");
    setAssigning(uid);
    try {
      await assignRfidToBombonaByUid(uid, bombonaId);
      alert("RFID atribuída");
      if (onAssigned) onAssigned();
      await load();
      // fechar painel e limpar busca
      setOpenAssignUid(null);
      setSearchText("");
      setSelectedBombonaId(null);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Erro ao atribuir RFID");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>RFIDs não vinculadas</h3>
      <div style={{ marginBottom: 8 }}>
        <button className="small-button" onClick={load}>Atualizar</button>
      </div>

      {loading ? <p>Carregando...</p> : (
        <>
          {rfids.length === 0 ? <p style={{ color: "#666" }}>Nenhuma RFID não vinculada</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {rfids.map(r => (
                <li key={r.id} style={{ padding: 8, borderBottom: "1px solid #eee", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div><strong>{r.uid}</strong></div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Última leitura: {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "-"}
                    </div>
                    {r.metadata && <div style={{ fontSize: 12, color: "#666" }}>meta: {JSON.stringify(r.metadata)}</div>}
                  </div>

                  <div style={{ minWidth: 280 }}>
                    {/* botão abre painel de autocomplete */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="small-button"
                        onClick={() => {
                          if (openAssignUid === r.uid) {
                            setOpenAssignUid(null);
                            setSearchText("");
                          } else {
                            setOpenAssignUid(r.uid);
                            setSearchText("");
                            setSelectedBombonaId(null);
                          }
                        }}
                      >
                        {openAssignUid === r.uid ? "Fechar" : "Atribuir"}
                      </button>

                      <button
                        className="small-button"
                        onClick={() => {
                          const id = prompt("Informe ID da bombona para atribuir (ou cancele):");
                          if (id) handleAssign(r.uid, Number(id));
                        }}
                        disabled={Boolean(assigning)}
                      >
                        {assigning === r.uid ? "Atribuindo..." : "Atribuir por ID"}
                      </button>
                    </div>

                    {/* painel de autocomplete */}
                    {openAssignUid === r.uid && (
                      <div style={{ marginTop: 8, background: "#fff", padding: 8, borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}>
                        <input
                          placeholder="Buscar por serial ou label..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
                          autoFocus
                        />

                        {suggestions.length === 0 ? <div style={{ color: "#666" }}>Nenhuma bombona encontrada</div> : (
                          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 180, overflow: "auto" }}>
                            {suggestions.map(b => (
                              <li key={b.id} style={{ padding: 6, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f0f0" }}>
                                <div>
                                  <div style={{ fontSize: 14 }}><strong>{b.serial}</strong> {b.label ? `— ${b.label}` : ""}</div>
                                  <div style={{ fontSize: 12, color: "#666" }}>{b.latitude != null ? `📍 ${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}` : ""}</div>
                                </div>
                                <div style={{ marginLeft: 8 }}>
                                  <button
                                    className="small-button"
                                    onClick={() => handleAssign(r.uid, b.id)}
                                    disabled={Boolean(assigning)}
                                  >
                                    {assigning === r.uid ? "Atribuindo..." : "Atribuir aqui"}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}