const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

// Configuración de CORS de alto nivel
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

// Middleware de seguridad manual para garantizar el CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }
    next();
});


app.use(express.json());

// 3. Conexión a Base de Datos
// 3. Conexión a Base de Datos usando las variables de Clever Cloud
const db = mysql.createConnection({
    host: process.env.MYSQL_ADDON_HOST,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    port: process.env.MYSQL_ADDON_PORT || 3306
});

// --- RUTAS ---
app.post('/api/register', (req, res) => {
    // Tu lógica de registro...
});

app.post('/api/login', (req, res) => {
    // Tu lógica de login...
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));