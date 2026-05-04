import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // SPTrans Proxy Routes
  const SPTRANS_API_BASE = "http://api.olhovivo.sptrans.com.br/v2.1";
  let sptransCookie: string | null = null;

  async function getSPTransCookie() {
    if (sptransCookie) return sptransCookie;
    
    const token = process.env.SPTRANS_TOKEN;
    if (!token) {
      console.warn("SPTRANS_TOKEN environment variable is not set. Using fallback mock data or failing requests.");
      throw new Error("SPTRANS_TOKEN não configurado no servidor.");
    }

    try {
      const response = await fetch(`${SPTRANS_API_BASE}/Login/Autenticar?token=${token}`, { method: 'POST' });
      const text = await response.text();
      
      if (text === 'true') {
        sptransCookie = response.headers.get('set-cookie');
        return sptransCookie;
      } else {
        throw new Error("Falha na autenticação da SPTrans (Token inválido)");
      }
    } catch (e: any) {
      throw new Error(`Erro ao conectar com SPTrans: ${e.message}`);
    }
  }

  // Check if API is configured
  app.get("/api/sptrans/status", (req, res) => {
    res.json({ configured: !!process.env.SPTRANS_TOKEN });
  });

  app.get("/api/sptrans/*", async (req, res) => {
    try {
      let cookie = await getSPTransCookie();
      if (!cookie) return res.status(500).json({ error: "Failed to obtain SPTrans cookie" });

      const targetPath = req.originalUrl.replace('/api/sptrans', '');
      
      let response = await fetch(`${SPTRANS_API_BASE}${targetPath}`, {
        headers: { 'Cookie': cookie }
      });

      // If unauthorized, token might have expired, try to reconnect once
      if (!response.ok && response.status === 401) {
        sptransCookie = null; // Invalidate cached cookie
        cookie = await getSPTransCookie();
        if (!cookie) return res.status(500).json({ error: "Failed to obtain SPTrans cookie on retry" });
        
        response = await fetch(`${SPTRANS_API_BASE}${targetPath}`, {
          headers: { 'Cookie': cookie }
        });
      }

      if (!response.ok) {
        return res.status(response.status).json({ error: "Upstream API error" });
      }

      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from the dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
