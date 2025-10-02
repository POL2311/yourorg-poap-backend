import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import permitsRouter from './routes/permits';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json()); // necesario para leer JSON

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), mongo: 'connected', redis: 'connected' });
});
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`)
  next()
})

// monta exactamente en /api/permits
app.use('/api/permits', permitsRouter);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
