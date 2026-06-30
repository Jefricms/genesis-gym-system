const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

// Configuración de CORS para aceptar peticiones desde tu GitHub Pages
app.use(cors({
    origin: '*', // Permite conexiones desde cualquier origen
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Conexión a la base de datos usando variables de entorno
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
});

db.connect((err) => {
    if (err) console.error("❌ Error de conexión a MySQL:", err);
    else console.log("¡Conectado exitosamente a la base de datos!");
});

// --- RUTAS DE EJEMPLO ---

app.post('/api/register', (req, res) => {
    const { nombre, email } = req.body;
    if (!nombre || !email) return res.status(400).json({ error: 'Campos obligatorios' });
    
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const primerNombre = nombre.split(' ')[0].toUpperCase();
    const codigoMiembro = `IFG-${randomNum}-${primerNombre}`;

    const query = 'INSERT INTO usuarios (nombre, email, miembro_desde, codigo_miembro) VALUES (?, ?, NOW(), ?)';
    db.query(query, [nombre, email, codigoMiembro], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error interno' });
        res.json({ success: true, id: result.insertId, user: { name: nombre, email, memberId: codigoMiembro } });
    });
});

app.post('/api/login', (req, res) => {
    const { email } = req.body;
    const query = 'SELECT id, nombre, email, codigo_miembro FROM usuarios WHERE LOWER(email) = LOWER(?)';
    db.query(query, [email], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Usuario no encontrado" });
        const usuario = results[0];
        res.json({ success: true, user: { id: usuario.id, name: usuario.nombre, email: usuario.email, memberId: usuario.codigo_miembro } });
    });
});

// Puerto configurado para Clever Cloud
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));