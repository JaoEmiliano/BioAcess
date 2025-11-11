'use client';

import { useEffect, useState } from 'react';


const API = "https://ungouged-damien-scarabaeoid.ngrok-free.dev"; 

export default function Home() {
  const [tags, setTags] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [graph, setGraph] = useState<string>('');

  const load = async () => {
    const [t, s, g] = await Promise.all([
      fetch(`${API}/tags`).then(r => r.json()),
      fetch(`${API}/stats`).then(r => r.json()),
      fetch(`${API}/graph`).then(r => r.blob())
    ]);
    setTags(t);
    setStats(s);
    setGraph(URL.createObjectURL(g));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="p-8 max-w-7xl mx-auto bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
        <h1 className="text-4xl font-bold text-center text-indigo-700 mb-2">
          RFID Dashboard Pro
        </h1>
        <p className="text-center text-gray-600">SQLite + FastAPI + Next.js</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Tags Recentes */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
            Últimas Tags
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tags.map((t, i) => (
              <div key={i} className={`p-3 rounded-lg text-sm font-mono ${
                t.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex justify-between">
                  <code className="text-xs">{t.uid}</code>
                  <span className={`text-xs px-2 py-1 rounded ${
                    t.valid ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                  }`}>
                    {t.valid ? 'Válido' : 'Inválido'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t.timestamp.split(' ')[1]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Estatísticas */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Estatísticas</h2>
          {stats && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="font-semibold text-blue-700">Total</div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <div className="font-semibold text-purple-700">Únicos</div>
                  <div className="text-2xl font-bold">{stats.unicos}</div>
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="font-semibold text-green-700">Válidos</div>
                <div className="text-2xl font-bold">{stats.validos}</div>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-2">Top 5 UIDs</p>
                <ul className="space-y-1 text-xs">
                  {stats.top5.map((x: any, i: number) => (
                    <li key={i} className="flex justify-between bg-gray-50 p-2 rounded">
                      <code>{x.uid}</code>
                      <span className="font-bold text-indigo-600">{x.count}x</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

         {/* Gráfico */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Gráfico de Frequência</h2>
          {graph ? (
            <img
              src={graph}
              alt="Gráfico de Frequência"
              className="rounded-xl border w-full h-64 object-contain bg-gray-50"
            />
          ) : (
            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-full h-64 flex items-center justify-center text-gray-500">
              Carregando gráfico...
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <a 
          href={`${API}/download`} 
          className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
        >
          Baixar Banco de Dados (.db)
        </a>
      </div>
    </main>
  );
}