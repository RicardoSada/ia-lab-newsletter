const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Abrir o crear la base de datos SQLite local
const db = new sqlite3.Database(path.join(__dirname, 'ialab.db'), (err) => {
  if (err) console.error('Error al abrir SQLite:', err.message);
  else console.log('Base de datos SQLite conectada con éxito (ialab.db).');
});

// Inicializar tablas y datos iniciales
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS votos (
    noticia_id TEXT PRIMARY KEY,
    cantidad INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comentarios (
    id TEXT PRIMARY KEY,
    noticia_id TEXT,
    autor TEXT,
    texto TEXT,
    fecha TEXT,
    estado TEXT,
    motivo TEXT,
    borrador_ia TEXT,
    respuesta TEXT
  )`);

  // Sembrar votos iniciales si la tabla está vacía
  const votosIniciales = {
    'n14-1': 18, 'n14-2': 11, 'n14-3': 9, 'n14-4': 14,
    'n13-1': 16, 'n13-2': 12, 'n13-3': 8,
    'n12-1': 13, 'n12-2': 7, 'n12-3': 10,
    'n11-1': 15, 'n11-2': 9
  };
  for (const [id, cant] of Object.entries(votosIniciales)) {
    db.run(`INSERT OR IGNORE INTO votos (noticia_id, cantidad) VALUES (?, ?)`, [id, cant]);
  }

  // Sembrar comentarios iniciales si la tabla está vacía
  db.get('SELECT COUNT(*) as total FROM comentarios', (err, row) => {
    if (!err && row && row.total === 0) {
      const initC = [
        {
          id: 'c1', noticia_id: 'n14-1', autor: 'Marta G.', fecha: 'lunes, 10:42', estado: 'aprobado', motivo: 'Sin señales de riesgo',
          texto: '¿Se sabe cuánto aumenta la latencia con esta fase de verificación? Para un asistente de secretaría eso importa bastante.',
          borrador_ia: null,
          respuesta: JSON.stringify({ tipo: 'editado', texto: 'Las fuentes no dan una cifra única, porque depende de cuántos caminos de razonamiento genere el modelo en cada consulta. En el Lab lo mediremos con nuestras propias preguntas antes de proponerlo para ningún servicio.' })
        },
        {
          id: 'c2', noticia_id: 'n14-4', autor: 'Carlos M.', fecha: 'martes, 16:05', estado: 'ambiguo', motivo: 'Pregunta directa que la noticia no responde',
          texto: '¿Un chatbot que responde dudas sobre matrícula contaría como sistema de alto riesgo?',
          borrador_ia: 'Gracias por la pregunta, Carlos. En principio, un asistente que solo informa sobre trámites no decide admisiones ni evalúa aprendizaje, así que no encajaría en la categoría de alto riesgo. Sí tendría obligaciones de transparencia: quien lo use debe saber que está hablando con una IA. Lo confirmaremos con el área jurídica de la universidad antes de darlo por cerrado.',
          respuesta: null
        },
        {
          id: 'c3', noticia_id: 'n14-2', autor: 'Lucía P.', fecha: 'martes, 18:31', estado: 'ambiguo', motivo: 'Tono crítico sin lenguaje ofensivo',
          texto: 'Me parece mucho humo. Los agentes llevan dos años prometiendo lo mismo y seguimos igual.',
          borrador_ia: 'Es una crítica razonable, Lucía, y los propios datos de la noticia van en esa línea: los agentes funcionan en tareas cortas y fallan en las largas. Por eso en el Lab trabajamos con automatizaciones acotadas y validadas por una persona, no con agentes autónomos.',
          respuesta: null
        }
      ];
      initC.forEach(c => {
        db.run(
          `INSERT INTO comentarios (id, noticia_id, autor, texto, fecha, estado, motivo, borrador_ia, respuesta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.noticia_id, c.autor, c.texto, c.fecha, c.estado, c.motivo, c.borrador_ia, c.respuesta]
        );
      });
    }
  });
});

// --- RUTAS DE LA API ---

// 1. Obtener votos y comentarios actualizados
app.get('/api/datos', (req, res) => {
  db.all('SELECT * FROM votos', [], (err, votos) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM comentarios', [], (err, comentarios) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ votos: votos || [], comentarios: comentarios || [] });
    });
  });
});

// 2. Sumar o restar un voto
app.post('/api/votar', (req, res) => {
  const { noticia_id, delta } = req.body;
  const cambio = Number(delta) || 1;
  db.run(
    `INSERT INTO votos (noticia_id, cantidad) VALUES (?, ?)
     ON CONFLICT(noticia_id) DO UPDATE SET cantidad = MAX(0, cantidad + ?)`,
    [noticia_id, Math.max(0, cambio), cambio],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// 3. Crear comentario
app.post('/api/comentarios', (req, res) => {
  const { id, noticiaId, autor, texto, fecha, estado, motivo, borradorIA, respuesta } = req.body;
  const respStr = respuesta ? JSON.stringify(respuesta) : null;
  db.run(
    `INSERT INTO comentarios (id, noticia_id, autor, texto, fecha, estado, motivo, borrador_ia, respuesta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, noticiaId, autor, texto, fecha, estado, motivo, borradorIA || null, respStr],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// 4. Moderar comentario (aprobar/rechazar)
app.post('/api/comentarios/moderar', (req, res) => {
  const { id, estado, respuesta } = req.body;
  const respStr = respuesta ? JSON.stringify(respuesta) : null;
  db.run(
    `UPDATE comentarios SET estado = ?, respuesta = ? WHERE id = ?`,
    [estado, respStr, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor IA Lab corriendo en http://localhost:${PORT}`);
});
// 5. Eliminar un comentario
app.post('/api/comentarios/eliminar', (req, res) => {
  const { id } = req.body;
  db.run(`DELETE FROM comentarios WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});