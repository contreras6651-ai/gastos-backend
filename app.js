import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const USER_ID = 1; // modo demo mientras no haya login

// health
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, db: "error", message: err.message });
  }
});

// listar categorias
app.get("/categories", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name FROM categories WHERE user_id=? ORDER BY name",
    [USER_ID]
  );
  res.json(rows);
});

// crear categoria
app.post("/categories", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });

  const [result] = await pool.query(
    "INSERT INTO categories (user_id, name) VALUES (?, ?)",
    [USER_ID, name.trim()]
  );

  res.status(201).json({ id: result.insertId, name: name.trim() });
});

// listar gastos (opcional from/to)
app.get("/expenses", async (req, res) => {
  const { from, to } = req.query;

  let sql = `
    SELECT e.id, e.amount, e.expense_date, e.note,
           c.id AS category_id, c.name AS category_name
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    WHERE e.user_id = ?
  `;
  const params = [USER_ID];

  if (from) { sql += " AND e.expense_date >= ?"; params.push(from); }
  if (to)   { sql += " AND e.expense_date <= ?"; params.push(to); }

  sql += " ORDER BY e.expense_date DESC, e.id DESC";

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// crear gasto
app.post("/expenses", async (req, res) => {
  const { category_id, amount, expense_date, note } = req.body;

  if (!category_id || !amount || !expense_date) {
    return res.status(400).json({ message: "category_id, amount y expense_date requeridos" });
  }

  const [result] = await pool.query(
    `INSERT INTO expenses (user_id, category_id, amount, expense_date, note)
     VALUES (?, ?, ?, ?, ?)`,
    [USER_ID, category_id, amount, expense_date, note || null]
  );

  res.status(201).json({ id: result.insertId });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 API listening on port ${port}`));
