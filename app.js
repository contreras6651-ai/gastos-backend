import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "./db.js";

dotenv.config();

const app = express();

// ✅ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ (AGREGADO) Responder preflight OPTIONS para Authorization (muy importante en navegador)
app.options("*", cors());

app.use(express.json());

// ✅ LOG SIMPLE (para debug en Railway)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ✅ JWT SECRET (ponlo en Railway Variables)
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ✅ Middleware de autenticación
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Token requerido" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (_err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

// ✅ (AGREGADO) crear categorías iniciales para usuario nuevo
async function ensureDefaultCategories(userId) {
  const [rows] = await pool.query(
    "SELECT id FROM categories WHERE user_id=? LIMIT 1",
    [userId]
  );
  if (rows.length) return;

  const defaults = ["Comida", "Transporte", "Entretenimiento", "Hogar"];
  const values = defaults.map((name) => [userId, name]);

  await pool.query(
    "INSERT INTO categories (user_id, name) VALUES ?",
    [values]
  );
}

// ✅ Ruta raíz
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Gastos API running",
    endpoints: [
      "/health",
      "/auth/register (POST)",
      "/auth/login (POST)",
      "/me (GET) [AUTH]",
      "/categories (GET/POST/PUT/DELETE) [AUTH]",
      "/expenses (GET/POST/PUT/DELETE) [AUTH]",
    ],
    note:
      "IMPORTANTE: /auth/register y /auth/login son POST. Si los abres en el navegador es GET.",
  });
});

// ✅ health
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, db: "error", message: err.message });
  }
});

// =========================
// AUTH
// =========================

// ✅ (GET informativo)
app.get("/auth/register", (_req, res) => {
  res.json({
    ok: true,
    message: "Usa POST /auth/register con JSON { email, password }",
  });
});

app.get("/auth/login", (_req, res) => {
  res.json({
    ok: true,
    message: "Usa POST /auth/login con JSON { email, password }",
  });
});

// ✅ (AGREGADO) endpoint para comprobar sesión desde el frontend
app.get("/me", auth, async (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ✅ Registro
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "email y password requeridos" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // revisa si ya existe
    const [exists] = await pool.query("SELECT id FROM users WHERE email=?", [
      cleanEmail,
    ]);
    if (exists.length) {
      return res.status(409).json({ message: "Ese email ya está registrado" });
    }

    // hash
    const hash = await bcrypt.hash(password, 10);

    // ✅ crear user
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [cleanEmail, hash]
    );

    // ✅ (AGREGADO) crea categorías por defecto
    await ensureDefaultCategories(result.insertId);

    // token
    const token = jwt.sign(
      { id: result.insertId, email: cleanEmail },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ ok: true, token });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// ✅ Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "email y password requeridos" });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email=?",
      [cleanEmail]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    // ✅ (AGREGADO) si el usuario no tiene categorías, créalas
    await ensureDefaultCategories(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ ok: true, token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// =========================
// CATEGORIES (AUTH)
// =========================

app.get("/categories", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      "SELECT id, name FROM categories WHERE user_id=? ORDER BY name",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/categories", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "name requerido" });
    }

    const [result] = await pool.query(
      "INSERT INTO categories (user_id, name) VALUES (?, ?)",
      [userId, name.trim()]
    );

    res.status(201).json({ id: result.insertId, name: name.trim() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/categories/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { name } = req.body;

    if (!id) return res.status(400).json({ message: "id inválido" });
    if (!name?.trim()) return res.status(400).json({ message: "name requerido" });

    const [result] = await pool.query(
      "UPDATE categories SET name=? WHERE id=? AND user_id=?",
      [name.trim(), id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/categories/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const [result] = await pool.query(
      "DELETE FROM categories WHERE id=? AND user_id=?",
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      message:
        "No se pudo borrar la categoría. Borra primero los gastos de esa categoría.",
      detail: err.message,
    });
  }
});

// =========================
// EXPENSES (AUTH)
// =========================

app.get("/expenses", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;

    let sql = `
      SELECT e.id, e.amount, e.expense_date, e.note,
             c.id AS category_id, c.name AS category_name
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ?
    `;
    const params = [userId];

    if (from) { sql += " AND e.expense_date >= ?"; params.push(from); }
    if (to)   { sql += " AND e.expense_date <= ?"; params.push(to); }

    sql += " ORDER BY e.expense_date DESC, e.id DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/expenses", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, amount, expense_date, note } = req.body;

    if (!category_id || !amount || !expense_date) {
      return res
        .status(400)
        .json({ message: "category_id, amount y expense_date requeridos" });
    }

    // asegura categoría del usuario
    const [cat] = await pool.query(
      "SELECT id FROM categories WHERE id=? AND user_id=?",
      [category_id, userId]
    );
    if (!cat.length) {
      return res.status(400).json({ message: "Categoría inválida" });
    }

    const [result] = await pool.query(
      `INSERT INTO expenses (user_id, category_id, amount, expense_date, note)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, category_id, amount, expense_date, note || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/expenses/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const { category_id, amount, expense_date, note } = req.body;

    if (!category_id || !amount || !expense_date) {
      return res
        .status(400)
        .json({ message: "category_id, amount y expense_date requeridos" });
    }

    const [cat] = await pool.query(
      "SELECT id FROM categories WHERE id=? AND user_id=?",
      [category_id, userId]
    );
    if (!cat.length) {
      return res.status(400).json({ message: "Categoría inválida" });
    }

    const [result] = await pool.query(
      `UPDATE expenses
       SET category_id=?, amount=?, expense_date=?, note=?
       WHERE id=? AND user_id=?`,
      [category_id, amount, expense_date, note || null, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/expenses/:id", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const [result] = await pool.query(
      "DELETE FROM expenses WHERE id=? AND user_id=?",
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 API listening on port ${port}`));
