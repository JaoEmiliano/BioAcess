import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

/* Auth helpers */
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

async function getSafeUser(id) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, createdAt: true },
  });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "Não autorizado" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    req.user = await getSafeUser(req.userId);
    if (!req.user) return res.status(401).json({ message: "Usuário inválido" });
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

/* Portal auth via api key */
async function portalAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) return res.status(401).json({ message: "API key required" });
  const portal = await prisma.portal.findUnique({ where: { apiKey: key } });
  if (!portal) return res.status(401).json({ message: "Portal not recognized" });
  req.portal = portal;
  next();
}

/* Auth routes */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "E-mail e senha são obrigatórios" });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: "E-mail já cadastrado" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro no servidor" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "E-mail e senha são obrigatórios" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "Credenciais inválidas" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Credenciais inválidas" });

    const token = generateToken(user);
    const safeUser = await getSafeUser(user.id);
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro no servidor" });
  }
});

/* Bombona endpoints */
app.post("/api/bombonas", authMiddleware, async (req, res) => {
  try {
    const { serial, label, contents, currentLocation, latitude, longitude } = req.body;
    if (!serial) return res.status(400).json({ message: "serial obrigatório" });

    const exists = await prisma.bombona.findUnique({ where: { serial } });
    if (exists) return res.status(409).json({ message: "Bombona já existe" });

    const bombona = await prisma.bombona.create({
      data: { serial, label, contents, currentLocation, latitude: latitude ?? null, longitude: longitude ?? null },
    });
    return res.status(201).json({ bombona });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro criando bombona" });
  }
});

app.get("/api/bombonas", authMiddleware, async (req, res) => {
  try {
    const bombonas = await prisma.bombona.findMany({
      orderBy: { updatedAt: "desc" },
      include: { rfid: true, movements: { take: 5, orderBy: { timestamp: "desc" } } },
    });
    const out = bombonas.map(b => ({ ...b, rfid: b.rfid ? { ...b.rfid, metadata: b.rfid.metadata ? JSON.parse(b.rfid.metadata) : null } : null }));
    return res.json({ bombonas: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar bombonas" });
  }
});

app.post("/api/bombonas/:id/assign-rfid", authMiddleware, async (req, res) => {
  try {
    const bombonaId = Number(req.params.id);
    const { rfidUid } = req.body;
    if (!rfidUid) return res.status(400).json({ message: "rfidUid obrigatório" });

    const bombona = await prisma.bombona.findUnique({ where: { id: bombonaId } });
    if (!bombona) return res.status(404).json({ message: "Bombona não encontrada" });

    let rfid = await prisma.rfid.findUnique({ where: { uid: rfidUid } });
    if (!rfid) {
      rfid = await prisma.rfid.create({ data: { uid: rfidUid, lastSeenAt: null } });
    }

    await prisma.bombona.update({ where: { id: bombonaId }, data: { rfidId: rfid.id } });
    await prisma.rfid.update({ where: { id: rfid.id }, data: { ownerId: req.userId } });

    return res.json({ ok: true, bombonaId, rfidId: rfid.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao associar RFID" });
  }
});

// Checkout manual (aceita coords)
app.post("/api/bombonas/:id/checkout", authMiddleware, async (req, res) => {
  try {
    const bombonaId = Number(req.params.id);
    const { toLocation, actor, timestamp, latitude, longitude } = req.body;
    const time = timestamp ? new Date(timestamp) : new Date();

    const bombona = await prisma.bombona.update({
      where: { id: bombonaId },
      data: {
        currentLocation: toLocation || null,
        status: "in_transit",
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
      },
    });

    await prisma.movement.create({
      data: {
        bombonaId,
        type: "checkout",
        actor: actor || req.user?.email,
        location: toLocation || null,
        timestamp: time,
        metadata: (latitude || longitude) ? JSON.stringify({ latitude, longitude }) : null,
      },
    });

    return res.json({ ok: true, bombona });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro no checkout" });
  }
});

// Checkin manual (aceita coords)
app.post("/api/bombonas/:id/checkin", authMiddleware, async (req, res) => {
  try {
    const bombonaId = Number(req.params.id);
    const { atLocation, actor, timestamp, latitude, longitude } = req.body;
    const time = timestamp ? new Date(timestamp) : new Date();

    const bombona = await prisma.bombona.update({
      where: { id: bombonaId },
      data: {
        currentLocation: atLocation || null,
        status: "at_base",
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
      },
    });

    await prisma.movement.create({
      data: {
        bombonaId,
        type: "checkin",
        actor: actor || req.user?.email,
        location: atLocation || null,
        timestamp: time,
        metadata: (latitude || longitude) ? JSON.stringify({ latitude, longitude }) : null,
      },
    });

    return res.json({ ok: true, bombona });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro no checkin" });
  }
});

/* Reads endpoint (portal) */
app.post("/api/reads", portalAuth, async (req, res) => {
  try {
    const portal = req.portal;
    const reads = Array.isArray(req.body) ? req.body : [req.body];

    const results = await Promise.all(
      reads.map(async (r) => {
        const uid = String(r.uid);
        const timestamp = r.timestamp ? new Date(r.timestamp) : new Date();
        const metadataStr = r.metadata ? JSON.stringify(r.metadata) : null;

        let rfid = await prisma.rfid.findUnique({ where: { uid } });
        if (!rfid) {
          rfid = await prisma.rfid.create({
            data: { uid, metadata: metadataStr, active: true, lastSeenAt: timestamp },
          });
        } else {
          await prisma.rfid.update({
            where: { id: rfid.id },
            data: { lastSeenAt: timestamp, metadata: rfid.metadata || metadataStr },
          });
        }

        const readEvent = await prisma.readEvent.create({
          data: {
            uid,
            rfidId: rfid.id,
            portalId: portal.id,
            timestamp,
            rssi: r.rssi ?? null,
            antenna: r.antenna ?? null,
            metadata: metadataStr,
          },
        });

        const bombona = await prisma.bombona.findUnique({ where: { rfidId: rfid.id } });
        if (bombona) {
          // se metadata contém coords, parse e atualiza
          let coords = null;
          try {
            const metaObj = metadataStr ? JSON.parse(metadataStr) : null;
            if (metaObj?.latitude || metaObj?.longitude) coords = { latitude: Number(metaObj.latitude), longitude: Number(metaObj.longitude) };
          } catch (e) {}
          const updateData = { currentLocation: portal.location || portal.name, status: "at_portal" };
          if (coords) { updateData.latitude = coords.latitude; updateData.longitude = coords.longitude; }

          await prisma.bombona.update({
            where: { id: bombona.id },
            data: updateData,
          });

          await prisma.movement.create({
            data: {
              bombonaId: bombona.id,
              type: "portal_read",
              actor: portal.name,
              location: portal.location || portal.name,
              timestamp,
              metadata: metadataStr,
            },
          });
        }

        return { readEventId: readEvent.id, uid, rfidId: rfid.id };
      })
    );

    await prisma.portal.update({ where: { id: portal.id }, data: { lastSeenAt: new Date() } });
    return res.status(201).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao processar leituras" });
  }
});

/* Reads query endpoint (protected) */
app.get("/api/reads", authMiddleware, async (req, res) => {
  try {
    const { portalId, uid, from, to, limit = 100 } = req.query;
    const where = {};
    if (portalId) where.portalId = Number(portalId);
    if (uid) where.uid = String(uid);
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(String(from));
      if (to) where.timestamp.lte = new Date(String(to));
    }

    const reads = await prisma.readEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Number(limit),
      include: { portal: true, rfid: true },
    });

    const out = reads.map(r => ({ 
      ...r, 
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      rfid: r.rfid ? { ...r.rfid, metadata: r.rfid.metadata ? JSON.parse(r.rfid.metadata) : null } : null
    }));

    return res.json({ reads: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar leituras" });
  }
});

/* Health */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* Start server */
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});

// Atualizar bombona (label, serial, contents, coords)
app.patch("/api/bombonas/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = {};
    const { serial, label, contents, latitude, longitude } = req.body;
    if (serial !== undefined) data.serial = serial;
    if (label !== undefined) data.label = label;
    if (contents !== undefined) data.contents = contents;
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;

    const bombona = await prisma.bombona.update({ where: { id }, data });
    return res.json({ bombona });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar bombona" });
  }
});

// Marcar RFID como lida agora (ajusta lastSeenAt)
app.patch("/api/rfids/:uid/mark-seen", authMiddleware, async (req, res) => {
  try {
    const uid = String(req.params.uid);
    const now = new Date();
    const rfid = await prisma.rfid.updateMany({
      where: { uid },
      data: { lastSeenAt: now },
    });
    if (rfid.count === 0) return res.status(404).json({ message: "RFID não encontrada" });
    return res.json({ ok: true, uid, lastSeenAt: now });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao marcar RFID" });
  }
});

// obter bombona com movimentos completos
app.get("/api/bombonas/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const bombona = await prisma.bombona.findUnique({
      where: { id },
      include: { rfid: true, movements: { orderBy: { timestamp: "desc" } } },
    });
    if (!bombona) return res.status(404).json({ message: "Bombona não encontrada" });

    // desserializar metadata do rfid se houver
    const out = {
      ...bombona,
      rfid: bombona.rfid ? { ...bombona.rfid, metadata: bombona.rfid.metadata ? JSON.parse(bombona.rfid.metadata) : null } : null,
      movements: bombona.movements.map(m => ({ ...m, metadata: m.metadata ? JSON.parse(m.metadata) : null })),
    };

    return res.json({ bombona: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar bombona" });
  }
});

// listar movimentos de uma bombona (paginação opcional via ?limit & ?skip)
app.get("/api/bombonas/:id/movements", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Number(req.query.limit || 100);
    const skip = Number(req.query.skip || 0);
    const movements = await prisma.movement.findMany({
      where: { bombonaId: id },
      orderBy: { timestamp: "desc" },
      take: limit,
      skip,
    });
    const out = movements.map(m => ({ ...m, metadata: m.metadata ? JSON.parse(m.metadata) : null }));
    return res.json({ movements: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar movimentos" });
  }
});

// listar RFIDs não vinculadas
app.get("/api/rfids/unlinked", authMiddleware, async (req, res) => {
  try {
    // pega todas as RFIDs (ordem por última leitura)
    const rfids = await prisma.rfid.findMany({ orderBy: { lastSeenAt: "desc" } });

    // pega todos os rfidId já usados por bombonas
    const bombonas = await prisma.bombona.findMany({ select: { rfidId: true } });
    const used = new Set(bombonas.map(b => b.rfidId).filter(Boolean));

    const out = rfids
      .filter(r => !used.has(r.id))
      .map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }));

    return res.json({ rfids: out });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar RFIDs não vinculadas" });
  }
});

// atribuir RFID (por UID) a uma bombona
app.patch("/api/rfids/:uid/assign-bombona", authMiddleware, async (req, res) => {
  try {
    const uid = String(req.params.uid);
    const { bombonaId } = req.body;
    if (!bombonaId) return res.status(400).json({ message: "bombonaId obrigatório" });

    const rfid = await prisma.rfid.findUnique({ where: { uid } });
    if (!rfid) return res.status(404).json({ message: "RFID não encontrada" });

    const bombona = await prisma.bombona.findUnique({ where: { id: Number(bombonaId) } });
    if (!bombona) return res.status(404).json({ message: "Bombona não encontrada" });

    // atualiza vínculo na bombona e owner da RFID
    await prisma.bombona.update({ where: { id: bombona.id }, data: { rfidId: rfid.id } });
    await prisma.rfid.update({ where: { id: rfid.id }, data: { ownerId: req.userId } });

    return res.json({ ok: true, bombonaId: bombona.id, rfidId: rfid.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atribuir RFID" });
  }
});