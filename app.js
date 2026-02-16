import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();

// ✅ CORS (no rompe lo que ya tienes, pero evita problemas con la web)
app.use(
  cors({
    origin: "*", // si luego quieres restringir, aquí se cambia
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const USER_ID = 1; // modo demo mientras no haya login

// ✅ ruta raíz para que tu dominio no muestre "Not Found"
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Gastos API running",
    endpoints: [
      "/health",
      "/categories (GET/POST/PUT/DELETE)",
      "/expenses (GET/POST/PUT/DELETE)",
    ],
  });
});

// health
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, db: "error", message: err.message });
  }
});

// =========================
// CATEGORIES
// =========================

// listar categorias
app.get("/categories", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM categories WHERE user_id=? ORDER BY name",
      [USER_ID]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// crear categoria
app.post("/categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "name requerido" });

    const [result] = await pool.query(
      "INSERT INTO categories (user_id, name) VALUES (?, ?)",
      [USER_ID, name.trim()]
    );

    res.status(201).json({ id: result.insertId, name: name.trim() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ editar categoria (cambiar nombre)
app.put("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;

    if (!id) return res.status(400).json({ message: "id inválido" });
    if (!name?.trim()) return res.status(400).json({ message: "name requerido" });

    const [result] = await pool.query(
      "UPDATE categories SET name=? WHERE id=? AND user_id=?",
      [name.trim(), id, USER_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ borrar categoria
app.delete("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const [result] = await pool.query(
      "DELETE FROM categories WHERE id=? AND user_id=?",
      [id, USER_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    res.json({ ok: true });
  } catch (err) {
    // si falla por FK (hay gastos usando esa categoría)
    res.status(500).json({
      message:
        "No se pudo borrar la categoría. Asegúrate de borrar primero los gastos de esa categoría.",
      detail: err.message,
    });
  }
});

// =========================
// EXPENSES
// =========================

// listar gastos (opcional from/to)
app.get("/expenses", async (req, res) => {
  try {
    const { from, to } = req.query;

    let sql = `
      SELECT e.id, e.amount, e.expense_date, e.note,
             c.id AS category_id, c.name AS category_name
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ?
    `;
    const params = [USER_ID];

    if (from) {
      sql += " AND e.expense_date >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND e.expense_date <= ?";
      params.push(to);
    }

    sql += " ORDER BY e.expense_date DESC, e.id DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// crear gasto
app.post("/expenses", async (req, res) => {
  try {
    const { category_id, amount, expense_date, note } = req.body;

    if (!category_id || !amount || !expense_date) {
      return res
        .status(400)
        .json({ message: "category_id, amount y expense_date requeridos" });
    }

    const [result] = await pool.query(
      `INSERT INTO expenses (user_id, category_id, amount, expense_date, note)
       VALUES (?, ?, ?, ?, ?)`,
      [USER_ID, category_id, amount, expense_date, note || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ editar gasto
app.put("/expenses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const { category_id, amount, expense_date, note } = req.body;

    if (!category_id || !amount || !expense_date) {
      return res
        .status(400)
        .json({ message: "category_id, amount y expense_date requeridos" });
    }

    const [result] = await pool.query(
      `UPDATE expenses
       SET category_id=?, amount=?, expense_date=?, note=?
       WHERE id=? AND user_id=?`,
      [category_id, amount, expense_date, note || null, id, USER_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ borrar gasto
app.delete("/expenses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id inválido" });

    const [result] = await pool.query(
      "DELETE FROM expenses WHERE id=? AND user_id=?",
      [id, USER_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ 404 en JSON (si alguien entra a una ruta que no existe)
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 API listening on port ${port}`));
